import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const cliPath = join(packageRoot, "dist", "cli.js");
const stubClaude = join(__dirname, "fixtures", "stub-claude.mjs");

export async function withTempSessions(
  fn: (sessionsRoot: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "claude-sub-test-"));
  try {
    await fn(dir);
  } finally {
    await new Promise((r) => setTimeout(r, 300));
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

export function runCli(
  args: string[],
  env: Record<string, string> = {},
  cwd: string = packageRoot,
  stdin?: string,
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
        ...(needsStub ? { CLAUDE_BIN: stubClaude } : {}),
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
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code }));
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
