#!/usr/bin/env node
import { Command } from "commander";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { generateRunId, getSessionsRoot, getSessionDir } from "./paths.js";
import { getPromptAndPassthrough, getRunnerPassthrough } from "./argv.js";
import { readPromptFromFile, resolvePrompt, PROMPT_STDIN } from "./prompt.js";
import { codexExists, runSession, spawnDetachedRunner } from "./runner.js";
import {
  countStreamEvents,
  ensureSessionDir,
  getPid,
  getLastEventTs,
  isSessionRunning,
  readAssistantMessages,
  readEnvelope,
  readToolEvents,
  resolveRun,
  listRuns,
  stopSession,
  type RunScopeOptions,
} from "./session.js";
import { printOnboarding } from "./onboarding.js";
import { printDocs } from "./docs.js";
import { shouldShowOnboarding, shouldPrintVersion } from "./invoke.js";
import { VERSION } from "./version.js";
import type { Envelope } from "./envelope.js";

if (shouldPrintVersion(process.argv)) {
  process.stdout.write(`${VERSION}\n`);
  process.exit(0);
}

if (shouldShowOnboarding(process.argv)) {
  printOnboarding();
  process.exit(0);
}

interface GlobalOpts {
  dir?: string;
}

const RUNNER_START_GRACE_MS = 5_000;

function sessionsRoot(opts: GlobalOpts): string {
  return getSessionsRoot(opts.dir);
}

function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value) + "\n");
}

function printJsonl(items: unknown[]): void {
  for (const item of items) {
    printJson(item);
  }
}

function printErrorJson(message: string, extra?: Record<string, unknown>): never {
  printJson({ error: message, ...extra });
  process.exit(1);
}

function printStderrErrorJson(message: string, extra?: Record<string, unknown>): void {
  process.stderr.write(JSON.stringify({ error: message, ...extra }) + "\n");
}

function finishExec(envelope: Envelope, text: boolean): never {
  if (envelope.status === "ok") {
    if (text) {
      process.stdout.write(envelope.result);
      if (envelope.result && !envelope.result.endsWith("\n")) {
        process.stdout.write("\n");
      }
    } else {
      printJson(envelope);
    }
    process.exit(0);
  }

  printJson(envelope);
  const failText = envelope.error ?? envelope.result;
  if (failText) {
    process.stderr.write(failText);
    if (!failText.endsWith("\n")) {
      process.stderr.write("\n");
    }
  }
  process.exit(2);
}

function finishResult(envelope: Envelope): never {
  printJson(envelope);
  if (envelope.status !== "ok") {
    const failText = envelope.error ?? envelope.result;
    if (failText) {
      process.stderr.write(failText);
      if (!failText.endsWith("\n")) {
        process.stderr.write("\n");
      }
    }
    process.exit(2);
  }
  process.exit(0);
}

function filterPassthrough(args: string[]): string[] {
  return args.filter((arg) => arg !== PROMPT_STDIN);
}

function runScope(cmd: Command): RunScopeOptions {
  return {
    cwd: process.cwd(),
    all: Boolean(cmd.opts<{ all?: boolean }>().all),
  };
}

async function requireSessionDir(
  root: string,
  runId: string | undefined,
  scope: RunScopeOptions,
): Promise<string> {
  const result = await resolveRun(root, runId, scope);
  if (!result.ok) {
    printErrorJson(result.error);
  }
  return result.dir;
}

async function requireCodex(): Promise<void> {
  if (!(await codexExists())) {
    printErrorJson("codex not found", {
      install: "Install Codex CLI: https://developers.openai.com/codex/cli",
    });
  }
}

async function requirePrompt(commandName: "exec" | "start"): Promise<string> {
  const resolved = await resolvePrompt(commandName);
  if (typeof resolved !== "string") {
    const { error, ...extra } = resolved;
    printErrorJson(error, extra);
  }
  return resolved;
}

async function waitForEnvelope(
  sessionDir: string,
  timeoutSec?: number,
): Promise<
  | { done: true; envelope: NonNullable<Awaited<ReturnType<typeof readEnvelope>>> }
  | { done: false; reason: "dead" | "timeout" }
> {
  const deadline =
    timeoutSec !== undefined ? Date.now() + timeoutSec * 1000 : undefined;

  while (true) {
    const envelope = await readEnvelope(sessionDir);
    if (envelope) {
      return { done: true, envelope };
    }
    const running = await isSessionRunning(sessionDir);
    if (!running) {
      const pid = await getPid(sessionDir);
      if (pid !== null || !(await isSessionStillStarting(sessionDir))) {
        return { done: false, reason: "dead" };
      }
    }
    if (deadline !== undefined && Date.now() >= deadline) {
      return { done: false, reason: "timeout" };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function isSessionStillStarting(sessionDir: string): Promise<boolean> {
  try {
    const meta = await stat(join(sessionDir, "meta.json"));
    return Date.now() - meta.mtimeMs < RUNNER_START_GRACE_MS;
  } catch {
    try {
      const dir = await stat(sessionDir);
      return Date.now() - dir.mtimeMs < RUNNER_START_GRACE_MS;
    } catch {
      return false;
    }
  }
}

const program = new Command();

program
  .name("codex-subagent")
  .description("Thin CLI wrapper around codex with a documented file substrate")
  .option("--dir <path>", "sessions root override (also CODEX_SUB_HOME env)")
  .enablePositionalOptions()
  .helpOption(false);

program
  .command("exec")
  .description("Run synchronously and print the envelope")
  .argument("[prompt]", "prompt to send ('-' reads stdin; omit when using --prompt-file)")
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .option("--prompt-file <path>", "read prompt from file")
  .option("--text", "print only the final assistant message")
  .action(async function (this: Command) {
    const opts = this.parent?.opts<GlobalOpts>() ?? {};
    const text = this.opts<{ text?: boolean }>().text;
    const prompt = await requirePrompt("exec");
    const passthrough = filterPassthrough(
      getPromptAndPassthrough("exec").passthrough,
    );

    await requireCodex();

    const root = sessionsRoot(opts);
    await mkdir(root, { recursive: true });
    const runId = generateRunId();
    const sessionDir = getSessionDir(root, runId);

    const envelope = await runSession({
      sessionDir,
      runId,
      prompt,
      passthrough,
    });

    finishExec(envelope, Boolean(text));
  });

program
  .command("start")
  .description("Start a detached run and print run_id + dir")
  .argument("[prompt]", "prompt to send ('-' for stdin; omit when using --prompt-file)")
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .option("--prompt-file <path>", "read prompt from file")
  .action(async function (this: Command) {
    const opts = this.parent?.opts<GlobalOpts>() ?? {};
    const prompt = await requirePrompt("start");
    const passthrough = filterPassthrough(
      getPromptAndPassthrough("start").passthrough,
    );

    await requireCodex();

    const root = sessionsRoot(opts);
    await mkdir(root, { recursive: true });
    const runId = generateRunId();
    const sessionDir = getSessionDir(root, runId);
    await ensureSessionDir(sessionDir);

    await spawnDetachedRunner({
      sessionDir,
      runId,
      prompt,
      passthrough,
    });

    printJson({ run_id: runId, dir: sessionDir });
    process.exit(0);
  });

program
  .command("status")
  .description("Cheap poll of run status")
  .argument("[run_id]", "run id (default: latest in this directory)")
  .option("--all", "resolve latest run across all directories")
  .action(async function (this: Command, runId?: string) {
    const opts = this.parent?.opts<GlobalOpts>() ?? {};
    const root = sessionsRoot(opts);
    const sessionDir = await requireSessionDir(root, runId, runScope(this));

    const id = runId ?? sessionDir.split("/").pop()!;
    const running = await isSessionRunning(sessionDir);
    const events = await countStreamEvents(sessionDir);
    const lastEventTs = await getLastEventTs(sessionDir);
    const hasEnvelope = (await readEnvelope(sessionDir)) !== null;

    printJson({
      run_id: id,
      running,
      events,
      last_event_ts: lastEventTs,
      has_envelope: hasEnvelope,
    });
  });

program
  .command("result")
  .description("Print envelope.json for a run")
  .argument("[run_id]", "run id (default: latest in this directory)")
  .option("--all", "resolve latest run across all directories")
  .option("--wait", "block until run completes")
  .option("--timeout <sec>", "timeout in seconds when used with --wait", parseFloat)
  .action(async function (this: Command, runId?: string) {
    const opts = this.parent?.opts<GlobalOpts>() ?? {};
    const cmdOpts = this.opts<{ wait?: boolean; timeout?: number }>();
    const root = sessionsRoot(opts);
    const sessionDir = await requireSessionDir(root, runId, runScope(this));

    if (cmdOpts.wait) {
      const waited = await waitForEnvelope(sessionDir, cmdOpts.timeout);
      if (!waited.done) {
        if (waited.reason === "timeout") {
          printJson({ error: "timeout", running: true });
          process.exit(4);
        }
        printStderrErrorJson("envelope not found");
        process.exit(2);
      }
      finishResult(waited.envelope);
    }

    const envelope = await readEnvelope(sessionDir);
    if (envelope) {
      finishResult(envelope);
    }

    const running = await isSessionRunning(sessionDir);
    if (running) {
      printJson({ running: true });
      process.exit(3);
    }

    printErrorJson("envelope not found");
  });

program
  .command("last")
  .description("Print final assistant message as plain text")
  .argument("[run_id]", "run id (default: latest in this directory)")
  .option("--all", "resolve latest run across all directories")
  .action(async function (this: Command, runId?: string) {
    const opts = this.parent?.opts<GlobalOpts>() ?? {};
    const root = sessionsRoot(opts);
    const sessionDir = await requireSessionDir(root, runId, runScope(this));

    const envelope = await readEnvelope(sessionDir);
    if (envelope) {
      process.stdout.write(envelope.result);
      if (envelope.result && !envelope.result.endsWith("\n")) {
        process.stdout.write("\n");
      }
      return;
    }

    const messages = await readAssistantMessages(sessionDir);
    const last = messages.at(-1) ?? "";
    process.stdout.write(last);
    if (last && !last.endsWith("\n")) {
      process.stdout.write("\n");
    }
  });

program
  .command("messages")
  .description("Print all assistant messages separated by ---")
  .argument("[run_id]", "run id (default: latest in this directory)")
  .option("--all", "resolve latest run across all directories")
  .action(async function (this: Command, runId?: string) {
    const opts = this.parent?.opts<GlobalOpts>() ?? {};
    const root = sessionsRoot(opts);
    const sessionDir = await requireSessionDir(root, runId, runScope(this));

    const messages = await readAssistantMessages(sessionDir);
    process.stdout.write(messages.join("\n---\n"));
    if (messages.length > 0) {
      process.stdout.write("\n");
    }
  });

program
  .command("tools")
  .description("Print tool_call and tool_result events as JSONL")
  .argument("[run_id]", "run id (default: latest in this directory)")
  .option("--all", "resolve latest run across all directories")
  .action(async function (this: Command, runId?: string) {
    const opts = this.parent?.opts<GlobalOpts>() ?? {};
    const root = sessionsRoot(opts);
    const sessionDir = await requireSessionDir(root, runId, runScope(this));

    const events = await readToolEvents(sessionDir);
    printJsonl(events);
  });

program
  .command("list")
  .description("List recent runs as JSONL")
  .option("-n, --limit <n>", "max runs to list", "10")
  .option("--all", "list runs from all directories")
  .action(async function (this: Command) {
    const opts = this.parent?.opts<GlobalOpts>() ?? {};
    const cmdOpts = this.opts<{ limit: string }>();
    const limit = Number.parseInt(cmdOpts.limit, 10) || 10;
    const root = sessionsRoot(opts);
    const runs = await listRuns(root, limit, runScope(this));
    printJsonl(runs);
  });

program
  .command("stop")
  .description("SIGTERM a running detached run")
  .argument("<run_id>", "run id to stop")
  .action(async function (this: Command, runId: string) {
    const opts = this.parent?.opts<GlobalOpts>() ?? {};
    const root = sessionsRoot(opts);
    const sessionDir = join(root, runId);
    const result = await stopSession(sessionDir, runId);
    if (!result.ok) {
      printErrorJson(result.error);
    }
    printJson({ run_id: runId, stopped: true });
    process.exit(0);
  });

program
  .command("docs")
  .description("Embedded contract documentation (plain text)")
  .argument("[topic]", "schema | events | examples")
  .action((topic?: string) => {
    printDocs(topic);
  });

program
  .command("_runner")
  .description("hidden detached runner entrypoint")
  .argument("<session-dir>", "session directory")
  .option("--prompt <prompt>", "prompt")
  .option("--prompt-file <path>", "read prompt from file")
  .requiredOption("--run-id <runId>", "run id")
  .option("--cwd <path>", "working directory")
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .action(async function (this: Command, sessionDir: string) {
    const cmdOpts = this.opts<{
      prompt?: string;
      promptFile?: string;
      runId: string;
      cwd?: string;
    }>();
    const passthrough = filterPassthrough(getRunnerPassthrough());

    let prompt: string;
    if (cmdOpts.promptFile) {
      const fromFile = await readPromptFromFile(cmdOpts.promptFile);
      if (typeof fromFile !== "string") {
        printErrorJson(fromFile.error, { path: fromFile.path });
      }
      prompt = fromFile;
    } else if (cmdOpts.prompt) {
      prompt = cmdOpts.prompt;
    } else {
      printErrorJson("prompt is required: pass inline text, - for stdin, or --prompt-file <path>");
    }

    try {
      const envelope = await runSession({
        sessionDir,
        runId: cmdOpts.runId,
        prompt,
        passthrough,
        cwd: cmdOpts.cwd,
      });
      process.exit(envelope.status === "ok" ? 0 : 2);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      printJson({ error: message });
      process.exit(2);
    }
  });

program.parseAsync(process.argv).catch((err: Error) => {
  printJson({ error: err.message });
  process.exit(1);
});
