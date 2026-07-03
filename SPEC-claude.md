# claude-subagent SPEC (v1)

Third CLI in this repo: `claude-subagent`, wrapping the local `claude` CLI (Claude Code),
package at `packages/claude-sub`. **Mirror the siblings (`packages/cursor-sub`,
`packages/codex-sub`) exactly** in structure, verbs, file contract, exit codes, style, and
tests. Root SPEC.md applies except where this file overrides it. Still no shared core
package: copy, don't import across packages.

## What changes vs the siblings

### Backend invocation
- Binary: `claude`. Headless form:
  `claude -p --output-format stream-json --verbose "<prompt>" [flags...]`
  JSONL events on stdout. NOTE: `--output-format stream-json` with `-p` REQUIRES
  `--verbose` — omitting it is a hard error. All three are appended by default unless the
  caller already supplied them.
- Resume: claude has a native `--resume <session-id>` flag that works with `-p`. Our uniform
  `--resume <sid>` simply passes it through (no subcommand remapping like codex).

### Session storage
- `~/.subagent-clis/claude/sessions/<run_id>/`, env override `CLAUDE_SUB_HOME`, flag `--dir`.
- Envelope `backend: "claude"`. `session_id` from the `system/init` event (also present on
  every subsequent event and on the final `result` event).

### Execution profile
- Always appended: `-p --output-format stream-json --verbose`.
- Autonomy default: append `--dangerously-skip-permissions` UNLESS the caller supplied any
  of: `--permission-mode <x>`, `--allowedTools`/`--allowed-tools`, or
  `--dangerously-skip-permissions` themselves. (Analog of cursor-sub's plan/ask exception:
  an explicit permission posture from the caller wins; otherwise full autonomy.)
- No model default: claude picks up the user's configured default model. `--model` passes
  through. Other passthrough examples that must work bare: `--permission-mode plan`,
  `--model haiku`, `--add-dir <path>`, `--session-id <uuid>`, `--continue`.

### Raw → canonical event mapping (authoritative; derived from live sampling)
Raw events, one JSON object per stdout line, all carrying `session_id` and `uuid`:
- `{type:"system", subtype:"init", session_id, cwd, model?, tools, ...}` →
  {t:"lifecycle", event:"start", data:{session_id, model}} and capture session_id.
- `{type:"assistant", message:{model, content:[blocks]}}` → one canonical event PER block:
  - block `{type:"text", text}` → {t:"message", role:"assistant", text}
  - block `{type:"thinking", thinking}` → {t:"reasoning", text: thinking}
  - block `{type:"tool_use", id, name, input}` → {t:"tool_call", name, args: input}; record
    id→name in an in-memory map for correlating results.
  Also capture `message.model` for the envelope (authoritative model source).
- `{type:"user", message:{content:[blocks]}}` with block `{type:"tool_result",
  tool_use_id, content, is_error}` → {t:"tool_result", name: <from id→name map, else
  "unknown">, ok: !is_error, output: content flattened to text, 10KB truncation with note}.
- `{type:"result", subtype, is_error, result, usage, total_cost_usd, duration_ms, ...}` →
  {t:"usage", data:{usage, total_cost_usd}} then {t:"lifecycle", event:"end",
  data:{subtype, is_error}}. Envelope: result = its `result` string (fall back to last
  message text if absent); usage = its `usage` merged with {total_cost_usd}; status error
  when `is_error` true even if the process exits 0.
- `{type:"system", subtype:"thinking_tokens"}`, `{type:"rate_limit_event"}`, and anything
  else → {t:"other", raw_type: type or type/subtype, data} — never dropped.

### Onboarding page & docs verb
- Same self-onboarding page, same section order as the siblings. Factually correct draft;
  prose will be redrafted separately — favor accuracy.
- Claude-specific facts that must appear: the --verbose/stream-json coupling (as a note,
  callers don't need to care since it's defaulted); default profile is
  --dangerously-skip-permissions full autonomy and how to suppress it (pass your own
  --permission-mode, e.g. plan for read-only-ish analysis); permission-mode choices:
  acceptEdits, auto, bypassPermissions, default, dontAsk, plan; runs load the target
  project's CLAUDE.md, settings, and hooks — behavior varies by repo; envelope usage
  includes total_cost_usd; the standard SAFETY set (paid, status ok ≠ correct, interrupted
  runs leave edits, silent long runs, parallel same-cwd overlapping-edit caution — use the
  codex-sub generic wording, NOT the cursor serialize/hang wording).

### Tests
- Same stub pattern: fake `claude` script in fixtures emitting the canned sequence above
  (init, thinking_tokens, assistant with thinking+text+tool_use blocks, user tool_result,
  result with usage+total_cost_usd), PATH-prefixed. Cover: envelope (session_id from init,
  model from assistant message, result/usage/cost from result event, is_error→status error);
  per-block fan-out (one assistant event → multiple canonical events); tool_use_id→name
  correlation; verbose/stream-json defaults present in argv; --dangerously-skip-permissions
  appended by default and suppressed when caller passes --permission-mode; bare passthrough
  on exec AND start; incremental streaming; resume passthrough; list; onboarding headers;
  docs topics non-empty.

## Acceptance checklist
- `pnpm install && pnpm -r build && pnpm -r test` green from repo root — all three packages.
- `node packages/claude-sub/dist/cli.js --help` prints the onboarding page.
- packages/claude-sub/SCHEMA.md documents the claude mapping table and contract.
- packages/claude-sub/README.md: install, sync example, async example, jq example.
- Bin name `claude-subagent`; all self-references say `claude-subagent`.
- package.json build script includes the exec-bit fix on dist/cli.js (chmod +x in a
  postbuild or build step) — apply the same to the two sibling packages while you're here.
