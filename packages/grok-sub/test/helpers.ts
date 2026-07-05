import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const cliPath = join(packageRoot, "dist", "cli.js");
const stubGrok = join(__dirname, "fixtures", "stub-grok.mjs");

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function anySessionPidRunning(sessionsRoot: string): Promise<boolean> {
  let entries: string[];
  try {
    entries = await readdir(sessionsRoot);
  } catch {
    return false;
  }

  for (const entry of entries) {
    const pidPath = join(sessionsRoot, entry, "pid");
    try {
      const text = await readFile(pidPath, "utf8");
      const pid = Number.parseInt(text.trim(), 10);
      if (Number.isFinite(pid) && isPidRunning(pid)) {
        return true;
      }
    } catch {
      // no pid file or unreadable
    }
  }

  return false;
}

async function waitForSessionsIdle(
  sessionsRoot: string,
  deadlineMs = 3_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    if (!(await anySessionPidRunning(sessionsRoot))) {
      return;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

export async function withTempSessions(
  fn: (sessionsRoot: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "grok-sub-test-"));
  try {
    await fn(dir);
  } finally {
    await waitForSessionsIdle(dir);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

export function runCli(
  args: string[],
  env: Record<string, string> = {},
  cwd: string = packageRoot,
  stdin?: string,
  timeoutMs?: number,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  let i = 0;
  while (i < args.length && args[i] === "--dir") {
    i += 2;
  }
  const command = args[i];
  const needsStub =
    command !== undefined &&
    command !== "docs" &&
    command !== "--help" &&
    command !== "-h" &&
    command !== "--version" &&
    command !== "-V";

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: {
        ...process.env,
        ...(needsStub ? { GROK_BIN: stubGrok } : {}),
        ...env,
      },
      cwd,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c.toString();
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    const timeout =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.on("error", reject);
    child.on("close", (code) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      resolve({ stdout, stderr, code });
    });
    if (stdin !== undefined) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}

export async function waitForEnvelope(
  sessionsRoot: string,
  runId: string,
  timeoutMs = 10_000,
): Promise<void> {
  const envelopePath = join(sessionsRoot, runId, "envelope.json");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await readFile(envelopePath, "utf8");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`timeout waiting for envelope at ${envelopePath}`);
}

export async function waitForRunning(
  sessionsRoot: string,
  runId: string,
  env: Record<string, string>,
  timeoutMs = 10_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await runCli(
      ["--dir", sessionsRoot, "status", runId],
      env,
    );
    if (status.code === 0) {
      const obj = JSON.parse(status.stdout.trim()) as { running?: boolean };
      if (obj.running) {
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timeout waiting for run ${runId} to be running`);
}
