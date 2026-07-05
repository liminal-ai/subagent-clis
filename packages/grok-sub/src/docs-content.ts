/**
 * Embedded docs for `grok-subagent docs [topic]`.
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
    body: `grok-subagent docs — schema (schema_version: 1)
${DOCS_SOURCE_NOTE}

SESSION DIRECTORY
  ~/.subagent-clis/grok/sessions/<run_id>/
  Override root: --dir <path> or GROK_SUB_HOME env var.
  run_id format: <yyyymmdd-hhmmss>-<6 hex chars>  (e.g. 20260701-153000-a1b2c3)
  Grok's session id is envelope.session_id (from the end event), separate from run_id.

FILES (one directory per run)
  meta.json      Written at spawn. schema_version, run_id, backend:"grok", cwd,
                 model, argv (full grok argv), prompt, started_at.
  raw.jsonl      Verbatim grok stdout lines, appended as received.
  stream.jsonl   Canonical mapped events (see docs events), appended live with ts.
  stderr.log     grok stderr; detached runner bootstrap errors also here.
  pid            Runner process PID (grok-subagent worker, not grok child).
                 Not deleted on exit. No pid + no envelope => not running (crashed).
  envelope.json  Written once on completion. Always written, including on failure.

ENVELOPE (envelope.json / exec / result stdout)
  schema_version   number (1)
  backend          "grok"
  run_id           this CLI run's id
  session_id       sessionId from Grok end event, or null
  model            from argv --model/-m only, otherwise null
  cwd              working directory
  status           "ok" | "error"  ("error" when exit_code !== 0 OR error event seen)
  exit_code        grok process exit code
  result           accumulated text event data
  usage            null unless Grok starts reporting usage in streaming-json
  duration_ms      wall-clock milliseconds
  started_at       ISO8601
  ended_at         ISO8601
  stream_path      absolute path to stream.jsonl
  raw_path         absolute path to raw.jsonl
  stderr_path      absolute path to stderr.log
  error            optional string, last 2KB of stderr on failure
  model note: Grok streaming-json does not report the resolved model; this wrapper
              honestly records only an explicit --model/-m argv value.

EXIT CODES
  0  success
  1  usage / CLI error (includes missing grok)
  2  subagent run failed (envelope.status == "error")
  3  result not ready (result while still running, no --wait)
  4  wait timeout (result --timeout implies --wait; exceeded deadline)

VERSIONING
  schema_version: 1 applies to meta.json, envelope.json, and canonical stream events.
  Increment on breaking layout or event shape changes.
`,
  },
  events: {
    title: "events",
    summary: "Canonical stream.jsonl event types and Grok raw mapping",
    body: `grok-subagent docs — events (schema_version: 1)
${DOCS_SOURCE_NOTE}

FORMAT
  One JSON object per line in stream.jsonl.
  Every event has "ts" (ISO8601) stamped at receipt.
  Unknown raw grok events map to t:"other" — never dropped.
  raw.jsonl keeps every stdout line verbatim, including non-JSON warnings.

RAW → CANONICAL MAPPING (authoritative)

  first parsed JSON event
    → synthetic lifecycle {event:"start", data:{session_id:null, model:<argv model|null>}}

  text {data:string}
    → {t:"message", role:"assistant", text:data}
    → appends data to envelope.result accumulator

  thought {data:string}
    → {t:"reasoning", text:data}

  end {stopReason, sessionId, requestId}
    → captures sessionId for envelope.session_id
    → {t:"lifecycle", event:"end", data:{stop_reason, session_id, request_id}}

  error {message? | error? | data?}
    → {t:"error", message, data}
    → envelope.status becomes "error" even if process exit_code is 0

  max_turns_reached | auto_compact_* | anything else
    → {t:"other", raw_type:type, data}

CANONICAL EVENT TYPES

  message      t, role ("assistant"), text, ts
  reasoning    t, text, ts
  tool_call    t, name, args, ts, call_id (optional; reserved for future Grok stream types)
  tool_result  t, name, ok, output, ts, call_id (optional), truncated (optional; reserved)
  usage        t, data, ts (reserved; current stream does not provide usage)
  lifecycle    t, event ("start"|"end"), data, ts
  error        t, message, data, ts
  other        t, raw_type, data, ts

RAW.JSONL
  Verbatim grok stdout, one line per backend write (JSON events and any other output).
  Key raw selectors:
    session_id:  .type=="end" | .sessionId
    messages:    .type=="text" | .data
    thoughts:    .type=="thought" | .data
    errors:      .type=="error"
    usage/cost:  not reported by current Grok streaming-json
`,
  },
  examples: {
    title: "examples",
    summary: "Worked examples: sync, async, resume, parallel runs, jq queries",
    body: `grok-subagent docs — examples
${DOCS_SOURCE_NOTE}

SYNC (quick task)
  grok-subagent exec "Fix the type error in src/auth.ts"
  grok-subagent exec "Summarize this module" --text
  grok-subagent exec "Read-only review" --permission-mode plan

ASYNC (long task)
  grok-subagent start "Refactor the auth module"
  # => {"run_id":"20260701-153000-a1b2c3","dir":".../sessions/20260701-153000-a1b2c3"}
  grok-subagent status 20260701-153000-a1b2c3
  grok-subagent result 20260701-153000-a1b2c3 --wait

RESUME (continue a grok session)
  grok-subagent exec "Continue the refactor" --resume <session_id>
  # session_id is envelope.session_id from a prior run (not run_id).
  # Passed through to grok as --resume <session_id>.
  # Each resume creates a new run_id and session directory.

PASSTHROUGH FLAGS (no -- separator required)
  grok-subagent exec "task" --permission-mode plan
  grok-subagent exec "task" --model grok-build
  grok-subagent exec "task" --tools read_file,grep
  grok-subagent exec "task" --disallowed-tools run_terminal_cmd
  grok-subagent exec "task" --continue
  grok-subagent exec "task" -- --session-id <id>

JQ SELF-SERVICE (stream.jsonl)
  RUN=20260701-153000-a1b2c3
  STREAM="$HOME/.subagent-clis/grok/sessions/$RUN/stream.jsonl"
  jq -r 'select(.t=="message") | .text' "$STREAM"
  jq -r 'select(.t=="reasoning") | .text' "$STREAM"
  jq -c 'select(.t=="error")' "$STREAM"
  jq -c 'select(.t=="other") | {raw_type, data}' "$STREAM"

PARALLEL RUNS
  Prefer separate working directories or git worktrees per concurrent run.
  Grok mutates the cwd it runs in; parallel runs sharing one cwd can
  interleave file edits and corrupt each other's state.
  Pattern:
    git worktree add ../proj-agent-a -b agent/a && cd ../proj-agent-a
    grok-subagent start "task A" &
    cd ../proj-agent-b && grok-subagent start "task B"
  Or run sequentially from one agent if a single worktree is required.

INSPECTION WITHOUT VERBS
  cat ~/.subagent-clis/grok/sessions/<run_id>/envelope.json
  tail -f ~/.subagent-clis/grok/sessions/<run_id>/stream.jsonl
  cat ~/.subagent-clis/grok/sessions/<run_id>/stderr.log
`,
  },
};

export function listTopics(): string {
  const lines = ["grok-subagent docs — available topics", ""];
  for (const topic of Object.values(TOPICS)) {
    lines.push(`  ${topic.title.padEnd(10)} ${topic.summary}`);
  }
  lines.push("");
  lines.push("Usage: grok-subagent docs <topic>");
  lines.push("");
  return lines.join("\n");
}

export function getTopic(name: string): string | null {
  return TOPICS[name]?.body ?? null;
}
