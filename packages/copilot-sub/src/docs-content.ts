/**
 * Embedded docs for `copilot-subagent docs [topic]`.
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
    body: `copilot-subagent docs — schema (schema_version: 1)
${DOCS_SOURCE_NOTE}

SESSION DIRECTORY
  ~/.subagent-clis/copilot/sessions/<run_id>/
  Override root: --dir <path> or COPILOT_SUB_HOME env var.
  Copilot also keeps backend-side session/auth/log state under ~/.copilot.
  run_id is local to this wrapper. envelope.session_id is Copilot's sessionId.

FILES
  meta.json      Written at spawn. schema_version, run_id, backend:"copilot",
                 cwd, model fallback from argv, full argv, prompt, started_at.
  raw.jsonl      Verbatim Copilot stdout lines, appended as received.
  stream.jsonl   Canonical mapped events (see docs events), appended live with ts.
  stderr.log     Copilot stderr; detached runner bootstrap errors also here.
  pid            Runner process PID (copilot-subagent worker, not Copilot child).
  envelope.json  Written once on completion. Always written, including on failure.

ENVELOPE
  schema_version   number (1)
  backend          "copilot"
  run_id           this CLI run's id
  session_id       result.sessionId from Copilot, or null
  model            stream-reported model, falling back to explicit argv --model
  cwd              working directory
  status           "ok" | "error"
  exit_code        result.exitCode when present, otherwise Copilot process exit
  result           last assistant.message.data.content
  usage            result.usage verbatim, including premiumRequests
  duration_ms      wall-clock milliseconds
  started_at       ISO8601
  ended_at         ISO8601
  stream_path      absolute path to stream.jsonl
  raw_path         absolute path to raw.jsonl
  stderr_path      absolute path to stderr.log
  error            optional string, last 2KB of stderr on failure

STATUS RULES
  "error" when effective exit_code !== 0 or an error-shaped event is seen.
  Copilot result.exitCode is authoritative even when the outer process exits 0.

EXIT CODES
  0  success
  1  usage / CLI error (includes missing copilot)
  2  subagent run failed (envelope.status == "error")
  3  result not ready (result while still running, no --wait)
  4  wait timeout (result --timeout implies --wait; exceeded deadline)
`,
  },
  events: {
    title: "events",
    summary: "Canonical stream.jsonl event types and Copilot raw mapping",
    body: `copilot-subagent docs — events (schema_version: 1)
${DOCS_SOURCE_NOTE}

FORMAT
  One JSON object per line in stream.jsonl.
  Every event has "ts" (ISO8601) stamped at receipt.
  Unknown raw Copilot events map to t:"other" and raw.jsonl keeps every non-empty
  stdout line verbatim, including non-JSON warnings.

RAW → CANONICAL MAPPING
  session.tools_updated {data:{model}}
    → updates state.model
    → other

  first meaningful non-session event
    → synthetic lifecycle {event:"start", data:{session_id:null, model}}

  assistant.message {data:{content, model, toolRequests, outputTokens}}
    → if content is non-empty: {t:"message", role:"assistant", text:content}
    → model updates envelope.model; final non-empty content becomes envelope.result
    → empty tool-request messages map to other; raw.jsonl still has toolRequests

  assistant.message_delta {data:{deltaContent}, ephemeral:true}
    → other (deltas are not accumulated to avoid duplicating final content)

  assistant.reasoning {data:{content}}
    → {t:"reasoning", text:content} when content is non-empty

  tool.execution_start {data:{toolCallId, toolName, arguments}}
    → {t:"tool_call", name:toolName, args:arguments, call_id:toolCallId}

  tool.execution_complete {data:{toolCallId, success, result}}
    → {t:"tool_result", name, ok:success, output, call_id}
    → output is result.content, result.detailedContent, or JSON; truncated at 10KB

  result {sessionId, exitCode, usage}
    → captures envelope.session_id, envelope.exit_code, envelope.usage
    → {t:"usage", data:usage}
    → {t:"lifecycle", event:"end", data:{session_id, exit_code}}

  error or *.error
    → {t:"error", message, data}
    → envelope.status becomes "error"

  user.message | assistant.turn_* | session.* | tool.execution_partial_result | anything else
    → {t:"other", raw_type:type, data}

CANONICAL EVENT TYPES
  message      t, role ("assistant"), text, ts
  reasoning    t, text, ts
  tool_call    t, name, args, ts, call_id
  tool_result  t, name, ok, output, ts, call_id, truncated (optional)
  usage        t, data, ts
  lifecycle    t, event ("start"|"end"), data, ts
  error        t, message, data, ts
  other        t, raw_type, data, ts

RAW.JSONL SELECTORS
  session_id:  .type=="result" | .sessionId
  model:       .data.model
  messages:    .type=="assistant.message" | .data.content
  deltas:      .type=="assistant.message_delta" | .data.deltaContent
  tool calls:  .type=="tool.execution_start"
  tool output: .type=="tool.execution_complete"
  usage/cost:  .type=="result" | .usage
`,
  },
  examples: {
    title: "examples",
    summary: "Worked examples: sync, async, resume, parallel runs, jq queries",
    body: `copilot-subagent docs — examples
${DOCS_SOURCE_NOTE}

SYNC
  copilot-subagent exec "Fix the type error in src/auth.ts"
  copilot-subagent exec "Summarize this module" --text
  copilot-subagent exec "Read-only review" --mode plan

ASYNC
  copilot-subagent start "Refactor the auth module"
  # => {"run_id":"20260701-153000-a1b2c3","dir":".../sessions/20260701-153000-a1b2c3"}
  copilot-subagent status 20260701-153000-a1b2c3
  copilot-subagent result 20260701-153000-a1b2c3 --wait

RESUME
  copilot-subagent exec "Continue the refactor" --resume <session_id>
  # session_id is envelope.session_id from a prior run, not run_id.
  # The wrapper rejects bare --resume because Copilot would open an interactive picker.

PASSTHROUGH FLAGS
  copilot-subagent exec "task" --mode plan
  copilot-subagent exec "task" --plan
  copilot-subagent exec "task" --model gpt-5.5
  copilot-subagent exec "task" --available-tools bash,read
  copilot-subagent exec "task" --allow-tool bash
  copilot-subagent exec "task" --deny-tool write
  copilot-subagent exec "task" -- --session-id <id>

JQ SELF-SERVICE
  RUN=20260701-153000-a1b2c3
  STREAM="$HOME/.subagent-clis/copilot/sessions/$RUN/stream.jsonl"
  jq -r 'select(.t=="message") | .text' "$STREAM"
  jq -r 'select(.t=="reasoning") | .text' "$STREAM"
  jq -c 'select(.t=="tool_call" or .t=="tool_result")' "$STREAM"
  jq -c 'select(.t=="usage") | .data' "$STREAM"
  jq -c 'select(.t=="error")' "$STREAM"

PARALLEL RUNS
  Prefer separate working directories or git worktrees per concurrent run.
  Copilot mutates the cwd it runs in; parallel runs sharing one cwd can interleave
  file edits.
  Pattern:
    git worktree add ../proj-agent-a -b agent/a && cd ../proj-agent-a
    copilot-subagent start "task A" &
    cd ../proj-agent-b && copilot-subagent start "task B"

INSPECTION WITHOUT VERBS
  cat ~/.subagent-clis/copilot/sessions/<run_id>/envelope.json
  tail -f ~/.subagent-clis/copilot/sessions/<run_id>/stream.jsonl
  cat ~/.subagent-clis/copilot/sessions/<run_id>/stderr.log
`,
  },
};

export function listTopics(): string {
  const lines = ["copilot-subagent docs — available topics", ""];
  for (const topic of Object.values(TOPICS)) {
    lines.push(`  ${topic.title.padEnd(10)} ${topic.summary}`);
  }
  lines.push("");
  lines.push("Usage: copilot-subagent docs <topic>");
  lines.push("");
  return lines.join("\n");
}

export function getTopic(name: string): string | null {
  return TOPICS[name]?.body ?? null;
}
