import { SCHEMA_VERSION, BACKEND } from "./paths.js";
import type { StreamState } from "./stream-mapper.js";

export interface MetaJson {
  schema_version: number;
  run_id: string;
  backend: typeof BACKEND;
  cwd: string;
  model: string | null;
  argv: string[];
  prompt: string;
  started_at: string;
}

export interface Envelope {
  schema_version: number;
  backend: typeof BACKEND;
  run_id: string;
  session_id: string | null;
  model: string | null;
  cwd: string;
  status: "ok" | "error";
  exit_code: number;
  result: string;
  usage: Record<string, unknown> | null;
  duration_ms: number;
  started_at: string;
  ended_at: string;
  stream_path: string;
  raw_path: string;
  stderr_path: string;
  error?: string;
}

export function buildEnvelope(params: {
  runId: string;
  cwd: string;
  startedAt: string;
  endedAt: string;
  exitCode: number;
  state: StreamState;
  streamPath: string;
  rawPath: string;
  stderrPath: string;
  stderrTail?: string;
}): Envelope {
  const durationMs =
    new Date(params.endedAt).getTime() - new Date(params.startedAt).getTime();
  const exitCode = params.state.resultExitCode ?? params.exitCode;
  const failed = exitCode !== 0 || params.state.isError;
  const envelope: Envelope = {
    schema_version: SCHEMA_VERSION,
    backend: BACKEND,
    run_id: params.runId,
    session_id: params.state.sessionId,
    model: params.state.model,
    cwd: params.cwd,
    status: failed ? "error" : "ok",
    exit_code: exitCode,
    result: params.state.resultText ?? params.state.lastAssistantText,
    usage: params.state.usage,
    duration_ms: durationMs,
    started_at: params.startedAt,
    ended_at: params.endedAt,
    stream_path: params.streamPath,
    raw_path: params.rawPath,
    stderr_path: params.stderrPath,
  };

  if (failed && params.stderrTail) {
    envelope.error = params.stderrTail;
  }

  return envelope;
}

export function buildMeta(params: {
  runId: string;
  cwd: string;
  model: string | null;
  argv: string[];
  prompt: string;
  startedAt: string;
}): MetaJson {
  return {
    schema_version: SCHEMA_VERSION,
    run_id: params.runId,
    backend: BACKEND,
    cwd: params.cwd,
    model: params.model,
    argv: params.argv,
    prompt: params.prompt,
    started_at: params.startedAt,
  };
}
