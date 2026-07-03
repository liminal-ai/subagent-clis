/**
 * Embedded docs for `cursor-subagent docs [topic]`.
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
    body: `cursor-subagent docs — schema (schema_version: 1)
${DOCS_SOURCE_NOTE}

SESSION DIRECTORY
  ~/.subagent-clis/cursor/sessions/<run_id>/
  Override root: --dir <path> or CURSOR_SUB_HOME env var.
  run_id format: <yyyymmdd-hhmmss>-<6 hex chars>  (e.g. 20260701-153000-a1b2c3)
  Cursor's own chat id is envelope.session_id (for --resume), separate from run_id.

FILES (one directory per run)
  meta.json      Written at spawn. schema_version, run_id, backend:"cursor", cwd,
                 model, argv (full cursor-agent argv), prompt, started_at.
  raw.jsonl      Verbatim cursor-agent stream-json lines, appended as received.
  stream.jsonl   Canonical mapped events (see docs events), appended live with ts.
  stderr.log     cursor-agent stderr; detached runner bootstrap errors also here.
  pid            Runner process PID (cursor-subagent worker, not cursor-agent child).
                 Not deleted on exit. No pid + no envelope => not running (crashed).
  envelope.json  Written once on completion. Always written, including on failure.

ENVELOPE (envelope.json / exec / result stdout)
  schema_version   number (1)
  backend          "cursor"
  run_id           this CLI run's id
  session_id       cursor chat id from result event, or null
  model            from system/init event, or null
  cwd              working directory
  status           "ok" | "error"  ("error" when exit_code !== 0)
  exit_code        cursor-agent process exit code
  result           final assistant text (best-effort on error)
  usage            object from result event, verbatim, or null
  duration_ms      wall-clock milliseconds
  started_at       ISO8601
  ended_at         ISO8601
  stream_path      absolute path to stream.jsonl
  raw_path         absolute path to raw.jsonl
  stderr_path      absolute path to stderr.log
  error            optional string, last 2KB of stderr on failure
  model note: envelope.model is a display name (e.g. "Composer 2.5") — not valid as a --model value.

EXIT CODES
  0  success
  1  usage / CLI error (includes missing cursor-agent)
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
    summary: "Canonical stream.jsonl event types and field reference",
    body: `cursor-subagent docs — events (schema_version: 1)
${DOCS_SOURCE_NOTE}

FORMAT
  One JSON object per line in stream.jsonl.
  Every event has "ts" (ISO8601) stamped at receipt.
  Unknown raw cursor-agent events map to t:"other" — never dropped.

EVENT TYPES

  message
    Fields: t, role ("assistant"), text, ts
    Source: raw type "assistant", message.content[].type == "text"

  reasoning
    Fields: t, text, ts
    Source: raw type "assistant", message.content[].type == "thinking"

  tool_call
    Fields: t, name, args (object), ts, call_id (optional)
    Source: raw type "tool_call", subtype "started"
    Name normalization:
      readToolCall -> Read    shellToolCall -> Bash    editToolCall -> Edit
      deleteToolCall -> Delete    globToolCall -> Glob    grepToolCall -> Grep
      other *ToolCall -> key with "ToolCall" suffix removed
    shellToolCall args: { command, description, workingDirectory }

  tool_result
    Fields: t, name, ok (bool), output (string), ts, call_id (optional), truncated (optional)
    Source: raw type "tool_call", subtype "completed"
    output truncated at 10KB with "...[truncated at 10KB]" and truncated:true

  usage
    Fields: t, data (object), ts
    Source: raw type "result" -> .usage

  lifecycle
    Fields: t, event ("start"|"end"), data (object), ts
    start: raw type "system", subtype "init" (data includes model)
    end:   raw type "result" (data includes session_id, is_error)

  other
    Fields: t, raw_type (string), data (object), ts
    Fallback for any unmapped raw event type. Preserves full raw payload in data.

RAW.JSONL
  Verbatim cursor-agent stream-json after stripping non-JSON noise.
  Key raw selectors (for cross-reference):
    assistant text:  .type=="assistant" | .message.content[] | select(.type=="text")
    session_id:      .type=="result" | .session_id
    model:           .type=="system" and .subtype=="init" | .model
`,
  },
  examples: {
    title: "examples",
    summary: "Worked examples: sync, async, resume, parallel runs, jq queries",
    body: `cursor-subagent docs — examples
${DOCS_SOURCE_NOTE}

SYNC (quick task)
  cursor-subagent exec "Fix the type error in src/auth.ts"
  cursor-subagent exec "Summarize this module" --text
  cursor-subagent exec "Plan the migration" --mode plan

ASYNC (long task)
  cursor-subagent start "Refactor the auth module"
  # => {"run_id":"20260701-153000-a1b2c3","dir":".../sessions/20260701-153000-a1b2c3"}
  cursor-subagent status 20260701-153000-a1b2c3
  cursor-subagent result 20260701-153000-a1b2c3 --wait

RESUME (continue a cursor chat)
  cursor-subagent exec "Continue the refactor" --resume <session_id>
  # session_id is envelope.session_id from a prior run (not run_id).
  # Each resume creates a new run_id and session directory.

JQ SELF-SERVICE (stream.jsonl)
  RUN=20260701-153000-a1b2c3
  STREAM="$HOME/.subagent-clis/cursor/sessions/$RUN/stream.jsonl"
  jq -c 'select(.t=="tool_call")' "$STREAM"
  jq -c 'select(.t=="tool_call") | {name, args}' "$STREAM"
  jq -r 'select(.t=="reasoning") | .text' "$STREAM"
  jq -r 'select(.t=="message") | .text' "$STREAM"

PARALLEL RUNS
  Prefer separate working directories or git worktrees per concurrent run.
  cursor-agent mutates the cwd it runs in; parallel runs sharing one cwd will
  interleave file edits and corrupt each other's state.
  Pattern:
    git worktree add ../proj-agent-a -b agent/a && cd ../proj-agent-a
    cursor-subagent start "task A" &
    cd ../proj-agent-b && cursor-subagent start "task B"
  Or run sequentially from one agent if a single worktree is required.

INSPECTION WITHOUT VERBS
  cat ~/.subagent-clis/cursor/sessions/<run_id>/envelope.json
  tail -f ~/.subagent-clis/cursor/sessions/<run_id>/stream.jsonl
  cat ~/.subagent-clis/cursor/sessions/<run_id>/stderr.log
`,
  },
};

export function listTopics(): string {
  const lines = ["cursor-subagent docs — available topics", ""];
  for (const topic of Object.values(TOPICS)) {
    lines.push(`  ${topic.title.padEnd(10)} ${topic.summary}`);
  }
  lines.push("");
  lines.push("Usage: cursor-subagent docs <topic>");
  lines.push("");
  return lines.join("\n");
}

export function getTopic(name: string): string | null {
  return TOPICS[name]?.body ?? null;
}
