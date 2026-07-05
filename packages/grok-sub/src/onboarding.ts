import process from "node:process";
import { VERSION } from "./version.js";

const CLI = "grok-subagent";

export function printOnboarding(): void {
  const text = `${CLI} ${VERSION} - Run Grok headlessly, return JSON envelopes

WHAT THIS DOES
  Thin wrapper over the local grok CLI. The calling agent decides what to build;
  ${CLI} executes the run, captures Grok's streaming-json stdout, and returns a
  JSON envelope. Runs execute in the current working directory at invocation
  time — cd into the target project before exec/start. Every run persists a
  session directory; commands are convenience over those files.

COMMANDS
  Hot path:
    exec "<prompt>"|- [flags...]    Synchronous run; prints envelope on completion.
    start "<prompt>"|- [flags...]   Detached run; prints {run_id, dir}, exits.
      Both accept --resume <session_id> from a prior envelope; --text (exec only)
      prints just the accumulated assistant text.
      Prompt input: inline text, - (piped stdin; a TTY or empty stdin is a clean
      JSON error), or --prompt-file <path>. Exactly one source; combining them
      errors as ambiguous. Resolved text is passed to grok as -p <prompt> and
      stored verbatim in meta.json for auditing.
    status [run_id] [--all]         Cheap poll: running, event count, envelope presence.
    result [run_id] [--wait]        Print envelope.json. Exit 3 if still running;
          [--timeout <sec>] [--all]  --timeout implies --wait; blocks, polling every 500ms.
    last [run_id] [--all]           Accumulated assistant text, plain text.
  Inspection:
    messages [run_id] [--all]       Assistant text chunks, ---separated.
    tools [run_id] [--all]          tool_call/tool_result events as JSONL, if mapped.
    list [-n 10] [--all]            Recent runs for this directory, one JSON line each.
    stop <run_id>                   SIGTERM the runner; envelope gets status "error",
                                    exit_code 1, error "run was stopped".
    docs [topic]                    Embedded deep docs: schema | events | examples.
  Omit run_id to target the latest run IN THIS DIRECTORY; --all targets machine-wide.

SESSION DIRECTORY
  ~/.subagent-clis/grok/sessions/<run_id>/
  Override sessions root: --dir flag or GROK_SUB_HOME env var (session file
  storage only — this does not choose where the run executes).
  Files per run:
    meta.json       Prompt, full argv, cwd, model, started_at. Written at spawn.
    raw.jsonl       Verbatim grok stdout lines, appended live.
    stream.jsonl    Canonical mapped events, each with ts, appended live.
    stderr.log      grok stderr; runner bootstrap errors land here too.
    pid             Runner process PID while in flight.
    envelope.json   Written once on completion.
  run_id format: yyyymmdd-hhmmss-<6hex>, generated locally.

ENVELOPE FIELDS
  schema_version, backend ("grok"), run_id, session_id, model, cwd,
  status (ok|error), exit_code, result (accumulated text deltas),
  usage (null unless Grok starts reporting usage in the stream), duration_ms,
  started_at, ended_at, stream_path, raw_path, stderr_path,
  error (last 2KB stderr, on failure only).
  session_id comes from Grok's end event. model is only from argv (--model/-m);
  Grok streaming-json does not report a resolved model. Field-by-field contract:
  docs schema.

EXECUTION PROFILE
  Always invokes: grok -p <prompt> --output-format streaming-json.
  Autonomy default: --always-approve, suppressed when the caller supplies an
  approval posture (--permission-mode, --allow, --deny, --always-approve, --yolo).
  Permission-mode choices from grok 0.2.56 help: default, acceptEdits, auto,
  dontAsk, bypassPermissions, plan.
  No model default — the user's configured Grok default applies; --model passes
  through and is copied into meta/envelope. Flags after the prompt that aren't
  ${CLI}'s own (--dir, --text, --wait, --timeout, --prompt-file) pass through to
  grok verbatim; no -- needed (though supported).
  Examples: --permission-mode plan, --model grok-build, --tools read_file,grep,
  --disallowed-tools run_terminal_cmd, --session-id <id>, --continue,
  --resume <session-id>. This wrapper requires --resume to include an id.

EXIT CODES
  0 ok | 1 CLI/usage error (includes unknown run_id) | 2 run failed | 3 result not ready | 4 wait timeout

SAFETY
  - Default profile is full autonomy via --always-approve — runs may mutate the
    cwd with broad tool access. Expect a dirty git worktree afterward. Pass your
    own --permission-mode/--allow/--deny posture to suppress the default.
  - Every run may call a paid external CLI. Current Grok streaming-json does not
    expose token usage or cost, so envelope.usage is usually null.
  - Parallel runs in the same cwd can conflict through overlapping file edits.
    Separate directories or git worktrees keep runs independent.
  - Envelope status "ok" means grok exited cleanly and emitted no error event —
    not that the work is correct. Read the diff and run tests before treating a
    task done.
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
