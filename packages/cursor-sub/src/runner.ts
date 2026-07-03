import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { open, writeFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { buildCursorAgentArgs } from "./args.js";
import {
  createStreamState,
  mapRawEvent,
  sanitizeJsonLine,
  type StreamState,
} from "./stream-mapper.js";
import { buildEnvelope, buildMeta } from "./envelope.js";
import {
  appendRawLine,
  appendStreamLine,
  ensureSessionDir,
  readEnvelope,
  writeEnvelope,
  writeMeta,
  writePid,
  tailStderr,
} from "./session.js";
import { sessionFilePaths, DEFAULT_MODEL } from "./paths.js";
import {
  PROMPT_ARGV_HANDOFF_THRESHOLD,
  PROMPT_HANDOFF_FILE,
} from "./prompt.js";
import type { Envelope } from "./envelope.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function cursorAgentExists(): Promise<boolean> {
  const bin = process.env.CURSOR_AGENT_BIN ?? "cursor-agent";
  if (process.env.CURSOR_AGENT_BIN) {
    try {
      await access(bin, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await access(bin, constants.X_OK);
    return true;
  } catch {
    return new Promise((resolve) => {
      const child = spawn("sh", ["-c", `command -v ${bin}`], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      child.on("close", (code) => resolve(code === 0));
      child.on("error", () => resolve(false));
    });
  }
}

function resolveAgentSpawn(
  execArgs: string[],
  prompt: string,
): { command: string; argv: string[] } {
  const bin = process.env.CURSOR_AGENT_BIN ?? "cursor-agent";
  const agentArgs = [
    "--print",
    "--output-format",
    "stream-json",
    ...execArgs,
    prompt,
  ];
  if (bin.endsWith(".mjs") || bin.endsWith(".js")) {
    return { command: process.execPath, argv: [bin, ...agentArgs] };
  }
  return { command: bin, argv: agentArgs };
}

export function getCliPath(): string {
  return join(__dirname, "cli.js");
}

function extractModelFromArgs(args: string[]): string {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" || args[i] === "-m") {
      return args[i + 1] ?? DEFAULT_MODEL;
    }
    if (args[i]?.startsWith("--model=")) {
      return args[i]!.slice("--model=".length);
    }
  }
  return DEFAULT_MODEL;
}

async function processRawLine(
  sessionDir: string,
  line: string,
  state: StreamState,
): Promise<void> {
  const sanitized = sanitizeJsonLine(line);
  if (!sanitized) {
    return;
  }

  await appendRawLine(sessionDir, sanitized);

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(sanitized) as Record<string, unknown>;
  } catch {
    const ts = new Date().toISOString();
    await appendStreamLine(sessionDir, {
      t: "other",
      raw_type: "parse_error",
      data: { line: sanitized },
      ts,
    });
    return;
  }

  const ts = new Date().toISOString();
  const events = mapRawEvent(raw, ts, state);
  for (const event of events) {
    await appendStreamLine(sessionDir, event);
  }
}

export async function runSession(params: {
  sessionDir: string;
  runId: string;
  prompt: string;
  passthrough: string[];
  cwd?: string;
}): Promise<Envelope> {
  const { sessionDir, runId, prompt, passthrough } = params;
  const cwd = params.cwd ?? process.cwd();
  const startedAt = new Date().toISOString();
  const paths = sessionFilePaths(sessionDir);
  const execArgs = buildCursorAgentArgs(passthrough);
  const argv = [
    "cursor-agent",
    "--print",
    "--output-format",
    "stream-json",
    ...execArgs,
    prompt,
  ];
  const model = extractModelFromArgs(execArgs);

  const state = createStreamState();
  let exitCode = 0;
  let lineBuffer = "";
  let stdoutQueue: Promise<void> = Promise.resolve();
  let agentChild: ChildProcess | null = null;
  let finalized = false;
  let stderrStream: ReturnType<typeof createWriteStream> | null = null;

  const finalize = async (
    code: number,
    stopped = false,
  ): Promise<Envelope> => {
    if (finalized) {
      return (await readEnvelope(sessionDir))!;
    }
    finalized = true;
    await stdoutQueue;
    stderrStream?.end();
    const endedAt = new Date().toISOString();
    const stderrTail = await tailStderr(sessionDir);
    const envelope = buildEnvelope({
      runId,
      cwd,
      startedAt,
      endedAt,
      exitCode: code,
      state,
      streamPath: paths.stream,
      rawPath: paths.raw,
      stderrPath: paths.stderr,
      stderrTail: code !== 0 && !stopped ? stderrTail.slice(-2048) : undefined,
    });
    if (stopped) {
      envelope.status = "error";
      envelope.error = "run was stopped";
    }
    await writeEnvelope(sessionDir, envelope);
    return envelope;
  };

  process.once("SIGTERM", () => {
    agentChild?.kill("SIGTERM");
    void finalize(1, true).then(() => process.exit(2));
  });

  await ensureSessionDir(sessionDir);
  await writePid(sessionDir, process.pid);
  await writeMeta(
    sessionDir,
    buildMeta({
      runId,
      cwd,
      model,
      argv,
      prompt,
      startedAt,
    }),
  );

  const { command, argv: agentArgv } = resolveAgentSpawn(execArgs, prompt);
  stderrStream = createWriteStream(paths.stderr, { flags: "w" });

  const enqueueLine = (line: string): void => {
    stdoutQueue = stdoutQueue.then(() => processRawLine(sessionDir, line, state));
  };

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, agentArgv, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        TERM: "dumb",
        NO_COLOR: "1",
        CLICOLOR: "0",
        FORCE_COLOR: "0",
      },
    });
    agentChild = child;

    child.stdout?.on("data", (chunk: Buffer) => {
      lineBuffer += chunk.toString("utf8");
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) {
          enqueueLine(line);
        }
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrStream!.write(chunk);
    });

    child.on("error", (err) => {
      stderrStream!.end();
      reject(err);
    });

    child.on("close", (code) => {
      if (finalized) {
        return;
      }
      if (lineBuffer.trim()) {
        enqueueLine(lineBuffer);
      }
      stdoutQueue
        .then(() => {
          exitCode = code ?? 1;
          stderrStream!.end();
          resolve();
        })
        .catch(reject);
    });
  }).catch((err: Error) => {
    if (finalized) {
      return;
    }
    exitCode = 1;
    stderrStream!.write(`\n${err.message}\n`);
    stderrStream!.end();
  });

  if (finalized) {
    return (await readEnvelope(sessionDir))!;
  }

  await stdoutQueue;

  return finalize(exitCode);
}

export async function spawnDetachedRunner(params: {
  sessionDir: string;
  runId: string;
  prompt: string;
  passthrough: string[];
  cwd?: string;
}): Promise<void> {
  const cliPath = getCliPath();
  const args = [
    cliPath,
    "_runner",
    params.sessionDir,
    "--run-id",
    params.runId,
  ];

  const handoffViaFile = params.prompt.length > PROMPT_ARGV_HANDOFF_THRESHOLD;
  if (handoffViaFile) {
    const promptPath = join(params.sessionDir, PROMPT_HANDOFF_FILE);
    await writeFile(promptPath, params.prompt, "utf8");
    args.push("--prompt-file", promptPath);
  } else {
    args.push("--prompt", params.prompt);
  }

  if (params.cwd) {
    args.push("--cwd", params.cwd);
  }

  if (params.passthrough.length > 0) {
    args.push(...params.passthrough);
  }

  const stderrPath = sessionFilePaths(params.sessionDir).stderr;
  const stderrHandle = await open(stderrPath, "w");

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ["ignore", "ignore", stderrHandle.fd],
    cwd: params.cwd ?? process.cwd(),
    env: process.env,
  });

  await stderrHandle.close();

  child.unref();
}
