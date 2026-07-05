import process from "node:process";
import { VERSION } from "./version.js";

const CLI = "cursor-subagent";

export function printOnboarding(): void {
  const text = `${CLI} ${VERSION} - Run Cursor's coding agent headlessly, return JSON envelopes

WHAT THIS DOES
  Thin wrapper over the local cursor-agent CLI. The calling agent decides what
  to build; ${CLI} executes the run, captures the full event stream,
  and returns a JSON envelope. Runs execute in the current working directory at
  invocation time — cd into the target project before exec/start. Every run
  persists a session directory whose file layout is the real API; commands are
  convenience over it.

COMMANDS
  Hot path:
    exec "<prompt>"|- [flags...]    Synchronous run; prints envelope on completion.
    start "<prompt>"|- [flags...]   Detached run; prints {run_id, dir}, exits.
      Both accept --resume <session_id> from a prior envelope; --text (exec only)
      prints just the final assistant message.
      Prompt input: inline text, - (piped stdin; a TTY or empty stdin is a clean
      JSON error), or --prompt-file <path>. Exactly one source; combining them
      errors as ambiguous. Resolved text is treated as an inline prompt and stored
      verbatim (trailing newline included) in meta.json for auditing; passthrough
      flags follow after -.
    status [run_id] [--all]         Cheap poll: running, event count, envelope presence.
    result [run_id] [--wait]        Print envelope.json. Exit 3 if still running;
          [--timeout <sec>] [--all]  --timeout implies --wait; blocks, polling every 500ms.
    last [run_id] [--all]           Final assistant message, plain text.
  Inspection:
    messages [run_id] [--all]       All assistant messages, ---separated.
    tools [run_id] [--all]          tool_call/tool_result events as JSONL.
    list [-n 10] [--all]            Recent runs for this directory, one JSON line each.
    stop <run_id>                   SIGTERM the runner; envelope gets status "error",
                                    exit_code 1, error "run was stopped" (distinguishes
                                    a stop from a real failure).
    docs [topic]                    Embedded deep docs: schema | events | examples.
  Omit run_id to target the latest run IN THIS DIRECTORY; --all targets machine-wide.

SESSION DIRECTORY
  ~/.subagent-clis/cursor/sessions/<run_id>/
  Override sessions root: --dir flag or CURSOR_SUB_HOME env var (session file
  storage only — this does not choose where the run executes).
  Files per run:
    meta.json       Prompt, full argv, cwd, model, started_at. Written at spawn.
    raw.jsonl       Verbatim cursor-agent stream-json events, appended live.
    stream.jsonl    Canonical mapped events, each with ts, appended live.
    stderr.log      cursor-agent stderr; runner bootstrap errors land here too.
    pid             Runner process PID while in flight.
    envelope.json   Written once on completion.
  run_id format: yyyymmdd-hhmmss-<6hex>, generated locally.

ENVELOPE FIELDS
  schema_version, backend ("cursor"), run_id, session_id, model, cwd,
  status (ok|error), exit_code, result (final assistant text),
  usage (verbatim from cursor or null), duration_ms, started_at, ended_at,
  stream_path, raw_path, stderr_path, error (last 2KB stderr, on failure only).
  Pass session_id to --resume for follow-up runs; each gets a new run_id and dir.
  model is a display name (e.g. "Composer 2.5") — NOT valid as a --model value.
  Field-by-field contract and model-value notes: docs schema.

EXECUTION PROFILE
  Defaults appended unless the caller already supplied them:
    --model composer-2.5 --trust --force --sandbox disabled
  Exception: if passthrough contains --mode plan, --mode ask, or --plan, --force
  and --sandbox disabled are NOT added (model default and --trust stay).
  Flags after the prompt that aren't ${CLI}'s own (--dir, --text, --wait,
  --timeout, --prompt-file) pass through to cursor-agent verbatim; no -- needed
  (though supported). Examples: --model composer-2.5-fast, --mode plan,
  --resume <session-id>.

EXIT CODES
  0 ok | 1 CLI/usage error (includes unknown run_id) | 2 run failed | 3 result not ready | 4 wait timeout

SAFETY
  - Implementation runs mutate the target cwd under full autonomy by default.
    Expect a dirty git worktree afterward.
  - Every run calls a paid external CLI.
  - Two runs in the same working directory may serialize or hang. For parallel
    runs, cd into separate directories or git worktrees before each start.
  - Envelope status "ok" means cursor-agent exited cleanly — NOT that the work
    is correct. Read the diff and run tests before treating a task as done.
  - An interrupted or failed run may still have left useful edits. Check git
    status and diffs before retrying, or you pay for the work twice.
  - Long runs are silent while working. A missing envelope is not failure —
    run status; running:true with a growing event count means it is working.

EXAMPLES
  Sync:   ${CLI} exec "Add input validation to parseConfig in src/config.ts"
  Stdin:  ${CLI} exec - --text < brief.md     (multi-line briefs, no shell quoting)
  Async:  cd /path/to/worktree
          ${CLI} start "Refactor auth middleware into separate module"
          ${CLI} status 20260701-101530-a1b2c3
          ${CLI} result 20260701-101530-a1b2c3 --wait --timeout 300

Event schema and raw mapping: docs events. jq recipes, resume, and parallel-run
patterns: docs examples. Full envelope and exit-code contract: docs schema.
`;
  process.stdout.write(text);
}
