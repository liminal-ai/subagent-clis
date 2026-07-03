# codex-subagent SPEC (v1)

Second CLI in this repo: `codex-subagent`, wrapping the local `codex` CLI (Codex CLI 0.142.x),
package at `packages/codex-sub`. **Mirror the sibling `packages/cursor-sub` exactly** in
structure, verbs, file contract, exit codes, style, and tests — it is the reference
implementation and its SPEC.md (repo root) applies here except where this file overrides it.
Still no shared core package: copy, don't import across packages.

## What changes vs cursor-sub

### Backend invocation
- Binary: `codex`. Headless form: `codex exec --json "<prompt>" [flags...]` — structured
  JSONL events on stdout, human progress noise on stderr.
- Heredoc/stdin form exists (`codex exec --json -`) — support prompt `-` passthrough as codex
  handles it natively (stdin must be wired through in that case).
- Resume is a SUBCOMMAND, not a flag: `codex exec resume --json <session-id> "prompt"`.
  Our CLI keeps the uniform interface: `--resume <session-id>` on exec/start, mapped
  internally to the subcommand form. `--resume` also accepts `--last` semantics? No — keep
  v1 minimal: require an explicit session id.
- `exec resume` does not support `-C`; we don't use `-C` anywhere — runs execute in caller cwd.

### Session storage
- `~/.subagent-clis/codex/sessions/<run_id>/` — same six files, same env override name
  pattern: `CODEX_SUB_HOME` (flag `--dir` same).
- Envelope `backend: "codex"`. `session_id` = the `thread_id` from the `thread.started` event.

### Execution profile (differs from cursor deliberately)
- Always append `--json` (required for the event stream).
- NO other defaults are appended. Model, reasoning effort, and sandbox come from the user's
  `~/.codex/config.toml` (on this machine: model gpt-5.5, effort high, sandbox
  danger-full-access). Do not fight or duplicate that config.
- Everything after the prompt that isn't codex-subagent's own flag (`--dir`, `--text`,
  `--wait`, `--timeout`, `--resume`) passes through verbatim, no `--` needed (`--` supported).
  Examples that must work bare: `-s read-only`, `-c model_reasoning_effort=medium`,
  `--full-auto`, `--skip-git-repo-check`, `-m <model>`, `--ephemeral`, `-i img.png`.
- Learn from cursor-sub's bug history: passthrough must work on BOTH exec and start paths
  (commander needs allowUnknownOption AND allowExcessArguments on every command incl. _runner),
  and events must stream to files incrementally as received, never buffered to exit.

### Raw → canonical event mapping (authoritative table)
Raw codex `--json` events, one JSON object per stdout line:
- `thread.started` {thread_id} → lifecycle {event:"start", data:{thread_id}} AND capture
  session_id for the envelope.
- `turn.started` → lifecycle {event:"start", data:{turn:true}}? No — map to
  {t:"other", raw_type:"turn.started"} to keep lifecycle for run start/end only. Same for
  `turn.completed` EXCEPT extract `usage` {input_tokens, cached_input_tokens, output_tokens}
  → emit a {t:"usage", data:{...}} event as well.
- `item.completed` with item.type `agent_message` {item.text} → {t:"message", role:"assistant", text}
- `item.completed` with item.type `reasoning` {item.text} → {t:"reasoning", text}
- `item.started` with item.type `command_execution` {item.command} →
  {t:"tool_call", name:"shell", args:{command}}
- `item.completed` with item.type `command_execution` {item.command, item.exit_code,
  item.aggregated_output} → {t:"tool_result", name:"shell", ok: exit_code===0,
  output: aggregated_output (same 10KB truncation rule)}
- Anything else → {t:"other", raw_type, data} — never dropped.
- Envelope `result` = text of the last agent_message; `usage` = usage object from the last
  `turn.completed` (verbatim, or null).

### Onboarding page & docs verb
- Same self-onboarding requirement: bare `codex-subagent` and `--help` print a full page in
  exactly the cursor-sub format (same section order). Write a factually correct draft — the
  prose will be redrafted separately later, so favor accuracy over polish.
- Codex-specific facts that must appear in SAFETY/notes: default sandbox on this machine is
  danger-full-access via config.toml (runs mutate cwd with full autonomy); runs are paid;
  codex requires the cwd to be a git repo unless `--skip-git-repo-check` is passed (a run in
  a non-git dir fails fast — the error lands in stderr.log); status "ok" ≠ work correct;
  interrupted runs may leave edits; long runs silent (check status).
- `docs` verb: same three topics, codex content.

### Tests
- Same stub pattern: a fake `codex` script in fixtures emitting a canned event sequence
  (thread.started, item.started/completed command_execution, item.completed agent_message,
  turn.completed with usage), PATH-prefixed. Cover: envelope correctness incl. session_id from
  thread.started and usage extraction; start/status/result lifecycle; incremental streaming
  (stub emits with delays; assert files grow mid-run); bare passthrough on exec AND start
  (e.g. `-s read-only` present in meta.json argv); resume maps to `exec resume <sid>` argv
  order; canonical mapping table above; list; onboarding page headers; docs topics non-empty.

## Acceptance checklist
- `pnpm install && pnpm -r build && pnpm -r test` green from repo root (cursor-sub suite
  must stay green too).
- `node packages/codex-sub/dist/cli.js --help` prints the onboarding page.
- packages/codex-sub/SCHEMA.md documents the codex mapping table and contract.
- packages/codex-sub/README.md: install, sync example, async example, jq example.
- Bin name in package.json: `codex-subagent`. All self-references use `codex-subagent`.
