# claude-sub file & event contract

`schema_version: 1`

This document is the API for the `claude-subagent` CLI substrate. Verbs are convenience wrappers; agents may read these files directly.

## Session directory layout

Each run gets an isolated directory:

```
~/.subagent-clis/claude/sessions/<run_id>/
```

Override the sessions root with `--dir <path>` or the `CLAUDE_SUB_HOME` environment variable.

### `run_id` format

Generated at start: `<yyyymmdd-hhmmss>-<6 hex chars>`

Example: `20260701-153000-a1b2c3`

This is the primary handle for `claude-subagent` commands. Claude's own session id is stored separately in the envelope as `session_id` (for `--resume`).

### Files

| File | Written | Description |
|------|---------|-------------|
| `meta.json` | At spawn | Run metadata (prompt, argv, cwd, model, started_at) |
| `raw.jsonl` | During run | Verbatim `claude` stream-json events |
| `stream.jsonl` | During run | Canonical mapped events (see below) |
| `stderr.log` | During run | `claude` stderr |
| `pid` | At spawn | PID of the runner process while running |
| `envelope.json` | On completion | Final result contract (see below) |

`pid` is not deleted on exit. Liveness is checked via `kill(pid, 0)` against the **runner** process (the `claude-subagent` worker, not the `claude` child). Once `envelope.json` exists, the run is considered complete regardless of `pid`. If there is no `pid` file and no envelope, the run is not running (crashed or never started).

`raw.jsonl` and `stream.jsonl` are appended incrementally as events arrive from `claude`, so `claude-subagent status` can report live `events` counts and `last_event_ts` while a run is in progress.

## `meta.json`

Written when the run starts:

```json
{
  "schema_version": 1,
  "run_id": "20260701-153000-a1b2c3",
  "backend": "claude",
  "cwd": "/path/where/it/ran",
  "model": null,
  "argv": ["claude", "-p", "--output-format", "stream-json", "--verbose", "..."],
  "prompt": "the user prompt",
  "started_at": "2026-07-01T15:30:00.000Z"
}
```

`model` is set only when `--model` is passed through; otherwise null until the assistant event reports `message.model`.

## Prompt input

`exec` and `start` accept a prompt in three equivalent ways. The resolved text is stored in `meta.json` and passed to `claude` as an inline argument — the wrapper resolves stdin and file input itself for uniform behavior.

**Inline positional** (default):

```bash
claude-subagent exec "Fix the bug in src/main.ts"
```

**Stdin** — use `-` as the positional prompt and pipe text to stdin:

```bash
echo "Summarize this module" | claude-subagent exec -
claude-subagent start - --permission-mode plan < task.txt
```

If stdin is a TTY or the piped content is empty/whitespace-only, the CLI exits `1` with a JSON error.

**File** — `--prompt-file <path>` reads the prompt from disk (CLI-owned flag; not passed through to `claude`):

```bash
claude-subagent exec --prompt-file ./task.txt
claude-subagent start --prompt-file ./task.txt --permission-mode plan
```

Missing or unreadable files exit `1` with a JSON error naming the path. Providing both a non-`-` positional prompt and `--prompt-file`, or both `-` and `--prompt-file`, exits `1` with an ambiguity error.

For detached `start`, prompts larger than 32KB are written to `prompt.txt` in the session directory for `_runner` handoff; `meta.json` still records the full prompt text.

## `envelope.json` (result contract)

Written once when the run finishes. Also printed by `claude-subagent exec` and `claude-subagent result`.

```json
{
  "schema_version": 1,
  "backend": "claude",
  "run_id": "20260701-153000-a1b2c3",
  "session_id": "<session_id from system/init>",
  "model": "claude-sonnet-4-20250514",
  "cwd": "/path/where/it/ran",
  "status": "ok",
  "exit_code": 0,
  "result": "<final result text>",
  "usage": {
    "input_tokens": 100,
    "output_tokens": 50,
    "total_cost_usd": 0.0042
  },
  "duration_ms": 12345,
  "started_at": "2026-07-01T15:30:00.000Z",
  "ended_at": "2026-07-01T15:30:12.345Z",
  "stream_path": "/abs/path/stream.jsonl",
  "raw_path": "/abs/path/raw.jsonl",
  "stderr_path": "/abs/path/stderr.log"
}
```

### Envelope fields

| Field | Type | Description |
|-------|------|-------------|
| `schema_version` | `1` | Contract version |
| `backend` | `"claude"` | Backend identifier |
| `run_id` | string | This CLI run's id |
| `session_id` | string \| null | `session_id` from `system/init` |
| `model` | string \| null | From `assistant.message.model` (authoritative) |
| `cwd` | string | Working directory |
| `status` | `"ok"` \| `"error"` | `"error"` when `exit_code !== 0` OR result `is_error` |
| `exit_code` | number | `claude` process exit code |
| `result` | string | `result` event string, or last assistant message text |
| `usage` | object \| null | Usage from `result` event, including `total_cost_usd` when present |
| `duration_ms` | number | Wall-clock duration |
| `started_at` | ISO8601 | Run start time |
| `ended_at` | ISO8601 | Run end time |
| `stream_path` | string | Absolute path to `stream.jsonl` |
| `raw_path` | string | Absolute path to `raw.jsonl` |
| `stderr_path` | string | Absolute path to `stderr.log` |
| `error` | string (optional) | Present on failure: last 2KB of stderr |

The runner always writes an envelope, including on crash or non-zero exit.

## Claude invocation

Normal run:

```
claude -p --output-format stream-json --verbose "<prompt>" [passthrough flags...]
```

Note: `--output-format stream-json` with `-p` **requires** `--verbose`. All three are appended by default unless the caller already supplied them.

Resume (passed through verbatim from `--resume <session-id>` on exec/start):

```
claude -p --output-format stream-json --verbose --resume <session-id> "<prompt>" [flags...]
```

Autonomy default: `--dangerously-skip-permissions` is appended unless the caller passes `--permission-mode`, `--allowedTools`/`--allowed-tools`, or `--dangerously-skip-permissions`.

## Raw → canonical event mapping

Raw claude stream-json events (one JSON object per stdout line), all carrying `session_id` and `uuid`:

| Raw event | Canonical output |
|-----------|------------------|
| `system` / `init` `{session_id, cwd, model?, tools, ...}` | `lifecycle` `{event:"start", data:{session_id, model}}`; captures `session_id` |
| `assistant` `{message:{model, content:[blocks]}}` | One canonical event **per block**: |
| — block `text` | `{t:"message", role:"assistant", text}` |
| — block `thinking` | `{t:"reasoning", text: thinking}` |
| — block `tool_use` `{id, name, input}` | `{t:"tool_call", name, args: input}`; record id→name map |
| `user` `{message:{content:[tool_result]}}` | `{t:"tool_result", name from id→name map (else "unknown"), ok: !is_error, output}` (10KB truncation) |
| `result` `{subtype, is_error, result, usage, total_cost_usd, ...}` | `{t:"usage", data:{usage + total_cost_usd}}` then `{t:"lifecycle", event:"end", data:{subtype, is_error}}` |
| `system` / `thinking_tokens`, `rate_limit_event`, anything else | `{t:"other", raw_type: type or type/subtype, data}` — never dropped |

Envelope `result` = the `result` event's `result` string (fall back to last message text if absent). Envelope `usage` = `usage` merged with `{total_cost_usd}`. Envelope `status` = `"error"` when `is_error` is true even if the process exits 0.

## `stream.jsonl` — canonical events

One JSON object per line. Every event includes `"ts"` (ISO8601, stamped at receipt).

### Event types

#### `message`

Assistant text output.

```json
{ "t": "message", "role": "assistant", "text": "...", "ts": "2026-07-01T15:30:01.000Z" }
```

Mapped from raw `type: "assistant"` with a `text` content block.

#### `reasoning`

Model thinking text.

```json
{ "t": "reasoning", "text": "...", "ts": "2026-07-01T15:30:01.000Z" }
```

Mapped from raw `type: "assistant"` with a `thinking` content block.

#### `tool_call`

Tool invocation.

```json
{ "t": "tool_call", "name": "Read", "args": { "file_path": "..." }, "call_id": "toolu_123", "ts": "..." }
```

Mapped from raw `type: "assistant"` with a `tool_use` content block.

#### `tool_result`

Tool output.

```json
{ "t": "tool_result", "name": "Read", "ok": true, "output": "...", "ts": "..." }
```

Mapped from raw `type: "user"` with a `tool_result` content block. Output is truncated at 10KB with `"...[truncated at 10KB]"` appended and `"truncated": true` set.

#### `usage`

Token usage and cost from `result`.

```json
{ "t": "usage", "data": { "input_tokens": 100, "output_tokens": 50, "total_cost_usd": 0.0042 }, "ts": "..." }
```

#### `lifecycle`

Run boundaries.

```json
{ "t": "lifecycle", "event": "start", "data": { "session_id": "...", "model": "..." }, "ts": "..." }
{ "t": "lifecycle", "event": "end", "data": { "subtype": "success", "is_error": false }, "ts": "..." }
```

#### `other`

Unknown or auxiliary raw event types are never dropped.

```json
{ "t": "other", "raw_type": "system/thinking_tokens", "data": { "...": "..." }, "ts": "..." }
```

## `raw.jsonl`

Verbatim JSON lines from `claude` stream-json stdout, after stripping non-JSON noise.

Key raw selectors:

- Session id: `.type == "system" and .subtype == "init"` → `.session_id`
- Assistant text: `.type == "assistant"` → `.message.content[] | select(.type=="text") | .text`
- Tool calls: `.type == "assistant"` → `.message.content[] | select(.type=="tool_use")`
- Tool results: `.type == "user"` → `.message.content[] | select(.type=="tool_result")`
- Usage/cost: `.type == "result"` → `{usage, total_cost_usd}`

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Usage / CLI error (includes missing `claude`) |
| `2` | Subagent run failed (`envelope.status == "error"`) |
| `3` | Result not ready (`claude-subagent result` while still running) |
| `4` | Wait timeout (`claude-subagent result --wait --timeout`) |

## Versioning

- `schema_version: 1` applies to `meta.json`, `envelope.json`, and canonical `stream.jsonl` events.
- Breaking changes to file layout or event shapes increment `schema_version`.
- Unknown fields in JSON objects should be preserved by readers where possible.
