/**
 * Embedded docs for `codex-subagent docs [topic]`.
 *
 * Source of truth: ../SCHEMA.md (package root). Content here is duplicated manually
 * as plain-text agent documentation embedded at build time. When SCHEMA.md changes,
 * update this module to match.
 */

export const DOCS_SOURCE_NOTE =
  "Source of truth: SCHEMA.md in the package root. This embedded copy is kept in sync manually.";

export const TOPICS: Record<string, { title: string; summary: string; body: string }> = {
  schema: {
    title: "schema",
    summary: "Session directory layout, envelope contract, exit codes",
    body: `codex-subagent docs — schema (schema_version: 1)
${DOCS_SOURCE_NOTE}

SESSION DIRECTORY
  ~/.subagent-clis/codex/sessions/<run_id>/
  Override root: --dir <path> or CODEX_SUB_HOME env var.
  run_id format: <yyyymmdd-hhmmss>-<6 hex chars>  (e.g. 20260701-153000-a1b2c3)
  Codex's thread id is envelope.session_id (for --resume), separate from run_id.

FILES (one directory per run)
  meta.json      Written at spawn. schema_version, run_id, backend:"codex", cwd,
                 model, argv (full codex argv), prompt, started_at.
  raw.jsonl      Verbatim codex --json lines, appended as received.
  stream.jsonl   Canonical mapped events (see docs events), appended live with ts.
  stderr.log     codex stderr; detached runner bootstrap errors also here.
  pid            Runner process PID (codex-subagent worker, not codex child).
                 Not deleted on exit. No pid + no envelope => not running (crashed).
  envelope.json  Written once on completion. Always written, including on failure.

ENVELOPE (envelope.json / exec / result stdout)
  schema_version   number (1)
  backend          "codex"
  run_id           this CLI run's id
  session_id       thread_id from thread.started event, or null
  model            from -m passthrough if supplied, or null (config.toml otherwise)
  cwd              working directory
  status           "ok" | "error"  ("error" when exit_code !== 0)
  exit_code        codex process exit code
  result           final assistant text (best-effort on error)
  usage            object from turn.completed, verbatim, or null
  duration_ms      wall-clock milliseconds
  started_at       ISO8601
  ended_at         ISO8601
  stream_path      absolute path to stream.jsonl
  raw_path         absolute path to raw.jsonl
  stderr_path      absolute path to stderr.log
  error            optional string, last 2KB of stderr on failure
  model note: usually null — codex events don't announce the config-default model, so it is populated only when the caller passes -m/--model.

EXIT CODES
  0  success
  1  usage / CLI error (includes missing codex)
  2  subagent run failed (envelope.status == "error")
  3  result not ready (result while still running, no --wait)
  4  wait timeout (result --wait --timeout exceeded)

VERSIONING
  schema_version: 1 applies to meta.json, envelope.json, and canonical stream events.
  Increment on breaking layout or event shape changes.
`,
  },
  events: {
    title: "events",
    summary: "Canonical stream.jsonl event types and codex raw mapping",
    body: `codex-subagent docs — events (schema_version: 1)
${DOCS_SOURCE_NOTE}

FORMAT
  One JSON object per line in stream.jsonl.
  Every event has "ts" (ISO8601) stamped at receipt.
  Unknown raw codex events map to t:"other" — never dropped.

RAW → CANONICAL MAPPING (authoritative)

  thread.started {thread_id}
    → lifecycle {event:"start", data:{thread_id}}; captures session_id

  turn.started
    → {t:"other", raw_type:"turn.started", data}

  turn.completed {usage}
    → {t:"other", raw_type:"turn.completed", data}
    → {t:"usage", data:{input_tokens, cached_input_tokens, output_tokens}} when usage present

  item.completed agent_message {item.text}
    → {t:"message", role:"assistant", text}

  item.completed reasoning {item.text}
    → {t:"reasoning", text}

  item.started command_execution {item.command}
    → {t:"tool_call", name:"shell", args:{command}}

  item.completed command_execution {item.command, item.exit_code, item.aggregated_output}
    → {t:"tool_result", name:"shell", ok: exit_code===0, output (10KB truncation)

  anything else
    → {t:"other", raw_type, data}

CANONICAL EVENT TYPES

  message      t, role ("assistant"), text, ts
  reasoning    t, text, ts
  tool_call    t, name, args, ts
  tool_result  t, name, ok, output, ts, truncated (optional)
  usage        t, data, ts
  lifecycle    t, event ("start"|"end"), data, ts
  other        t, raw_type, data, ts

RAW.JSONL
  Verbatim codex --json stdout, one JSON object per line.
  Key raw selectors:
    session_id:  .type=="thread.started" | .thread_id
    messages:    .type=="item.completed" and .item.type=="agent_message" | .item.text
    commands:    .type=="item.completed" and .item.type=="command_execution"
    usage:       .type=="turn.completed" | .usage
`,
  },
  examples: {
    title: "examples",
    summary: "Worked examples: sync, async, resume, parallel runs, jq queries",
    body: `codex-subagent docs — examples
${DOCS_SOURCE_NOTE}

SYNC (quick task)
  codex-subagent exec "Fix the type error in src/auth.ts"
  codex-subagent exec "Summarize this module" --text
  codex-subagent exec "Read-only review" -s read-only

ASYNC (long task)
  codex-subagent start "Refactor the auth module"
  # => {"run_id":"20260701-153000-a1b2c3","dir":".../sessions/20260701-153000-a1b2c3"}
  codex-subagent status 20260701-153000-a1b2c3
  codex-subagent result 20260701-153000-a1b2c3 --wait

RESUME (continue a codex thread)
  codex-subagent exec "Continue the refactor" --resume <session_id>
  # session_id is envelope.session_id from a prior run (thread_id, not run_id).
  # Maps internally to: codex exec resume --json <session_id> "prompt"
  # Each resume creates a new run_id and session directory.

PASSTHROUGH FLAGS (no -- separator required)
  codex-subagent exec "task" -s read-only
  codex-subagent exec "task" -c model_reasoning_effort=medium
  codex-subagent exec "task" --skip-git-repo-check
  codex-subagent exec "task" -- --full-auto

JQ SELF-SERVICE (stream.jsonl)
  RUN=20260701-153000-a1b2c3
  STREAM="$HOME/.subagent-clis/codex/sessions/$RUN/stream.jsonl"
  jq -c 'select(.t=="tool_call")' "$STREAM"
  jq -c 'select(.t=="tool_call") | {name, args}' "$STREAM"
  jq -r 'select(.t=="reasoning") | .text' "$STREAM"
  jq -r 'select(.t=="message") | .text' "$STREAM"

PARALLEL RUNS
  Prefer separate working directories or git worktrees per concurrent run.
  Codex mutates the cwd it runs in; parallel runs sharing one cwd will
  interleave file edits and corrupt each other's state.
  Pattern:
    git worktree add ../proj-agent-a -b agent/a && cd ../proj-agent-a
    codex-subagent start "task A" &
    cd ../proj-agent-b && codex-subagent start "task B"
  Or run sequentially from one agent if a single worktree is required.

INSPECTION WITHOUT VERBS
  cat ~/.subagent-clis/codex/sessions/<run_id>/envelope.json
  tail -f ~/.subagent-clis/codex/sessions/<run_id>/stream.jsonl
  cat ~/.subagent-clis/codex/sessions/<run_id>/stderr.log
`,
  },
};

export function listTopics(): string {
  const lines = ["codex-subagent docs — available topics", ""];
  for (const topic of Object.values(TOPICS)) {
    lines.push(`  ${topic.title.padEnd(10)} ${topic.summary}`);
  }
  lines.push("");
  lines.push("Usage: codex-subagent docs <topic>");
  lines.push("");
  return lines.join("\n");
}

export function getTopic(name: string): string | null {
  return TOPICS[name]?.body ?? null;
}
