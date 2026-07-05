/**
 * Embedded docs for `claude-subagent docs [topic]`.
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
    body: `claude-subagent docs — schema (schema_version: 1)
${DOCS_SOURCE_NOTE}

SESSION DIRECTORY
  ~/.subagent-clis/claude/sessions/<run_id>/
  Override root: --dir <path> or CLAUDE_SUB_HOME env var.
  run_id format: <yyyymmdd-hhmmss>-<6 hex chars>  (e.g. 20260701-153000-a1b2c3)
  Claude's session id is envelope.session_id (from system/init), separate from run_id.

FILES (one directory per run)
  meta.json      Written at spawn. schema_version, run_id, backend:"claude", cwd,
                 model, argv (full claude argv), prompt, started_at.
  raw.jsonl      Verbatim claude stream-json lines, appended as received.
  stream.jsonl   Canonical mapped events (see docs events), appended live with ts.
  stderr.log     claude stderr; detached runner bootstrap errors also here.
  pid            Runner process PID (claude-subagent worker, not claude child).
                 Not deleted on exit. No pid + no envelope => not running (crashed).
  envelope.json  Written once on completion. Always written, including on failure.

ENVELOPE (envelope.json / exec / result stdout)
  schema_version   number (1)
  backend          "claude"
  run_id           this CLI run's id
  session_id       session_id from system/init event, or null
  model            from assistant message.model (authoritative), or null
  cwd              working directory
  status           "ok" | "error"  ("error" when exit_code !== 0 OR result is_error)
  exit_code        claude process exit code
  result           result event's result string, or last assistant message text
  usage            object from result event (includes total_cost_usd when present), or null
  duration_ms      wall-clock milliseconds
  started_at       ISO8601
  ended_at         ISO8601
  stream_path      absolute path to stream.jsonl
  raw_path         absolute path to raw.jsonl
  stderr_path      absolute path to stderr.log
  error            optional string, last 2KB of stderr on failure
  model note: reliably populated — claude's assistant events always report the resolved model as a full id (e.g. claude-haiku-4-5-20251001), passed or defaulted.

EXIT CODES
  0  success
  1  usage / CLI error (includes missing claude)
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
    summary: "Canonical stream.jsonl event types and claude raw mapping",
    body: `claude-subagent docs — events (schema_version: 1)
${DOCS_SOURCE_NOTE}

FORMAT
  One JSON object per line in stream.jsonl.
  Every event has "ts" (ISO8601) stamped at receipt.
  Unknown raw claude events map to t:"other" — never dropped.

RAW → CANONICAL MAPPING (authoritative)

  system/init {session_id, cwd, model?, tools, ...}
    → lifecycle {event:"start", data:{session_id, model}}; captures session_id

  assistant {message:{model, content:[blocks]}}
    → one canonical event PER content block:
      text block     → {t:"message", role:"assistant", text}
      thinking block → {t:"reasoning", text: thinking}
      tool_use block → {t:"tool_call", name, args: input}; id→name map for results
    → captures message.model for envelope (authoritative model source)

  user {message:{content:[tool_result blocks]}}
    tool_result {tool_use_id, content, is_error}
    → {t:"tool_result", name from id→name map (else "unknown"),
       ok: !is_error, output (content flattened to text, 10KB truncation)}

  result {subtype, is_error, result, usage, total_cost_usd, duration_ms, ...}
    → {t:"usage", data:{usage fields + total_cost_usd}}
    → {t:"lifecycle", event:"end", data:{subtype, is_error}}
    → envelope result from result string; status error when is_error true

  system/thinking_tokens | rate_limit_event | anything else
    → {t:"other", raw_type: type or type/subtype, data}

CANONICAL EVENT TYPES

  message      t, role ("assistant"), text, ts
  reasoning    t, text, ts
  tool_call    t, name, args, ts, call_id (optional)
  tool_result  t, name, ok, output, ts, call_id (optional), truncated (optional)
  usage        t, data, ts
  lifecycle    t, event ("start"|"end"), data, ts
  other        t, raw_type, data, ts

RAW.JSONL
  Verbatim claude stream-json stdout, one JSON object per line.
  Key raw selectors:
    session_id:  .type=="system" and .subtype=="init" | .session_id
    messages:    .type=="assistant" | .message.content[] | select(.type=="text") | .text
    tool calls:  .type=="assistant" | .message.content[] | select(.type=="tool_use")
    tool results:.type=="user" | .message.content[] | select(.type=="tool_result")
    usage/cost:  .type=="result" | {usage, total_cost_usd}
`,
  },
  examples: {
    title: "examples",
    summary: "Worked examples: sync, async, resume, parallel runs, jq queries",
    body: `claude-subagent docs — examples
${DOCS_SOURCE_NOTE}

SYNC (quick task)
  claude-subagent exec "Fix the type error in src/auth.ts"
  claude-subagent exec "Summarize this module" --text
  claude-subagent exec "Read-only review" --permission-mode plan

ASYNC (long task)
  claude-subagent start "Refactor the auth module"
  # => {"run_id":"20260701-153000-a1b2c3","dir":".../sessions/20260701-153000-a1b2c3"}
  claude-subagent status 20260701-153000-a1b2c3
  claude-subagent result 20260701-153000-a1b2c3 --wait

RESUME (continue a claude session)
  claude-subagent exec "Continue the refactor" --resume <session_id>
  # session_id is envelope.session_id from a prior run (not run_id).
  # Passed through to claude as --resume <session_id>.
  # Each resume creates a new run_id and session directory.

PASSTHROUGH FLAGS (no -- separator required)
  claude-subagent exec "task" --permission-mode plan
  claude-subagent exec "task" --model haiku
  claude-subagent exec "task" --add-dir /path/to/extra
  claude-subagent exec "task" --continue
  claude-subagent exec "task" -- --session-id <uuid>

JQ SELF-SERVICE (stream.jsonl)
  RUN=20260701-153000-a1b2c3
  STREAM="$HOME/.subagent-clis/claude/sessions/$RUN/stream.jsonl"
  jq -c 'select(.t=="tool_call")' "$STREAM"
  jq -c 'select(.t=="tool_call") | {name, args}' "$STREAM"
  jq -r 'select(.t=="reasoning") | .text' "$STREAM"
  jq -r 'select(.t=="message") | .text' "$STREAM"
  jq 'select(.t=="usage") | .data.total_cost_usd' "$STREAM"

PARALLEL RUNS
  Prefer separate working directories or git worktrees per concurrent run.
  Claude mutates the cwd it runs in; parallel runs sharing one cwd will
  interleave file edits and corrupt each other's state.
  Pattern:
    git worktree add ../proj-agent-a -b agent/a && cd ../proj-agent-a
    claude-subagent start "task A" &
    cd ../proj-agent-b && claude-subagent start "task B"
  Or run sequentially from one agent if a single worktree is required.

INSPECTION WITHOUT VERBS
  cat ~/.subagent-clis/claude/sessions/<run_id>/envelope.json
  tail -f ~/.subagent-clis/claude/sessions/<run_id>/stream.jsonl
  cat ~/.subagent-clis/claude/sessions/<run_id>/stderr.log
`,
  },
};

export function listTopics(): string {
  const lines = ["claude-subagent docs — available topics", ""];
  for (const topic of Object.values(TOPICS)) {
    lines.push(`  ${topic.title.padEnd(10)} ${topic.summary}`);
  }
  lines.push("");
  lines.push("Usage: claude-subagent docs <topic>");
  lines.push("");
  return lines.join("\n");
}

export function getTopic(name: string): string | null {
  return TOPICS[name]?.body ?? null;
}
