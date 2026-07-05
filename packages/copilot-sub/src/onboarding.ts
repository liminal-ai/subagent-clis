import process from "node:process";
import { VERSION } from "./version.js";

const CLI = "copilot-subagent";

export function printOnboarding(): void {
  const text = `${CLI} ${VERSION} - Run GitHub Copilot CLI headlessly, return JSON envelopes

WHAT THIS DOES
  Thin wrapper over the local GitHub Copilot CLI. The calling agent decides what
  to do; ${CLI} executes Copilot with -p, captures JSONL stdout, and returns a
  stable JSON envelope. Runs execute in the current working directory at
  invocation time. Every run persists a session directory; commands are
  convenience over those files.

COMMANDS
  Hot path:
    exec "<prompt>"|- [flags...]    Synchronous run; prints envelope on completion.
    start "<prompt>"|- [flags...]   Detached run; prints {run_id, dir}, exits.
      Both accept --resume <session_id> from a prior envelope; --text (exec only)
      prints just the final assistant text.
      Prompt input: inline text, - (piped stdin; a TTY or empty stdin is a clean
      JSON error), or --prompt-file <path>. Exactly one source; combining them
      errors as ambiguous. Resolved text is passed to copilot as -p <prompt> and
      stored verbatim in meta.json for auditing.
    status [run_id] [--all]         Cheap poll: running, event count, envelope presence.
    result [run_id] [--wait]        Print envelope.json. Exit 3 if still running;
          [--timeout <sec>] [--all]  --timeout implies --wait; polls every 500ms.
    last [run_id] [--all]           Final assistant text, plain text.
  Inspection:
    messages [run_id] [--all]       Assistant messages, ---separated.
    tools [run_id] [--all]          tool_call/tool_result events as JSONL.
    list [-n 10] [--all]            Recent runs for this directory, one JSON line each.
    stop <run_id>                   SIGTERM the runner; envelope gets status "error".
    docs [topic]                    Embedded deep docs: schema | events | examples.
  Omit run_id to target the latest run IN THIS DIRECTORY; --all targets machine-wide.

SESSION DIRECTORY
  ~/.subagent-clis/copilot/sessions/<run_id>/
  Override sessions root: --dir flag or COPILOT_SUB_HOME env var. This is only
  wrapper storage; Copilot also keeps its own backend-side state under ~/.copilot.
  Files per run:
    meta.json       Prompt, full argv, cwd, model fallback, started_at.
    raw.jsonl       Verbatim Copilot stdout lines, appended live.
    stream.jsonl    Canonical mapped events, each with ts, appended live.
    stderr.log      Copilot stderr; runner bootstrap errors land here too.
    pid             Runner process PID while in flight.
    envelope.json   Written once on completion.

ENVELOPE FIELDS
  schema_version, backend ("copilot"), run_id, session_id, model, cwd,
  status (ok|error), exit_code, result, usage, duration_ms,
  started_at, ended_at, stream_path, raw_path, stderr_path,
  error (last 2KB stderr, on failure only).
  session_id comes from Copilot's final result.sessionId. model prefers
  assistant.message.data.model or session.tools_updated.data.model, falling back
  to argv --model. usage is Copilot result.usage verbatim, including
  premiumRequests. Field-by-field contract: docs schema.

EXECUTION PROFILE
  Always invokes: copilot -p <prompt> --output-format json.
  Defaults appended unless caller supplied an equivalent:
    --allow-all-tools   required by Copilot for non-interactive -p mode
    --no-auto-update    prevents a run from self-updating mid-flight
    --no-ask-user       disables ask_user because this wrapper cannot answer prompts
  Plan mode: --plan or --mode plan is passed through. The wrapper still adds
  --allow-all-tools because headless mode requires it, but it does not add broader
  permissions such as --allow-all-paths or --allow-all-urls.
  No model default is forced. Copilot help documents --model <model>; the top-level
  help does not list every account/provider model. The stream usually reports the
  resolved model, and that value wins in the envelope.
  Flags after the prompt that are not ${CLI}'s own (--dir, --text, --wait,
  --timeout, --prompt-file) pass through to copilot verbatim; no -- separator is
  needed, though supported. Examples: --mode plan, --plan, --model gpt-5.5,
  --available-tools bash,read, --allow-tool bash, --deny-tool write,
  --session-id <id>, --continue, --resume <session-id>.
  This wrapper rejects bare --resume / -r so it never opens Copilot's picker.

EXIT CODES
  0 ok | 1 CLI/usage error (includes unknown run_id) | 2 run failed | 3 result not ready | 4 wait timeout

SAFETY
  - --allow-all-tools lets Copilot run tools without confirmation. Runs may edit
    files or execute shell commands in the cwd. Expect a dirty git worktree.
  - premiumRequests in envelope.usage is real Copilot account consumption. Cheap
    prompts still cost; tool-heavy or long runs may cost more.
  - --no-auto-update is always appended by default so the backend cannot change
    underneath a running task.
  - Parallel runs in one cwd can conflict through overlapping file edits. Separate
    directories or git worktrees keep runs independent.
  - Envelope status "ok" means Copilot reported exitCode 0 and no error event was
    seen, not that the work is correct. Read the diff and run tests.

EXAMPLES
  Sync:   ${CLI} exec "Add input validation to parseConfig in src/config.ts"
  Stdin:  ${CLI} exec - --text < brief.md
  Async:  cd /path/to/worktree
          ${CLI} start "Refactor auth middleware into separate module"
          ${CLI} status 20260701-101530-a1b2c3
          ${CLI} result 20260701-101530-a1b2c3 --wait --timeout 300
  Resume: ${CLI} exec "Continue with exactly: resumed" --resume <session_id>

Event schema and raw mapping: docs events. jq recipes, resume, and parallel-run
patterns: docs examples. Full envelope and exit-code contract: docs schema.
`;
  process.stdout.write(text);
}
