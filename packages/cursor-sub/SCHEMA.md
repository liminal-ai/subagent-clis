# cursor-sub file & event contract

`schema_version: 1`

This document is the API for the `cursor-sub` CLI substrate. Verbs are convenience wrappers; agents may read these files directly.

## Session directory layout

Each run gets an isolated directory:

```
~/.subagent-clis/cursor/sessions/<run_id>/
```

Override the sessions root with `--dir <path>` or the `CURSOR_SUB_HOME` environment variable.

### `run_id` format

Generated at start: `<yyyymmdd-hhmmss>-<6 hex chars>`

Example: `20260701-153000-a1b2c3`

This is the primary handle for `cursor-sub` commands. Cursor's own chat/session id is stored separately in the envelope as `session_id` (for `--resume`).

### Files

| File | Written | Description |
|------|---------|-------------|
| `meta.json` | At spawn | Run metadata (prompt, argv, cwd, model, started_at) |
| `raw.jsonl` | During run | Verbatim `cursor-agent --output-format stream-json` events |
| `stream.jsonl` | During run | Canonical mapped events (see below) |
| `stderr.log` | During run | `cursor-agent` stderr |
| `pid` | At spawn | PID of the runner process while running |
| `envelope.json` | On completion | Final result contract (see below) |

`pid` is not deleted on exit. Liveness is checked via `kill(pid, 0)` against the **runner** process (the `cursor-sub` worker, not the `cursor-agent` child). Once `envelope.json` exists, the run is considered complete regardless of `pid`. If there is no `pid` file and no envelope, the run is not running (crashed or never started).

`raw.jsonl` and `stream.jsonl` are appended incrementally as events arrive from `cursor-agent`, so `cursor-sub status` can report live `events` counts and `last_event_ts` while a run is in progress.

## `meta.json`

Written when the run starts:

```json
{
  "schema_version": 1,
  "run_id": "20260701-153000-a1b2c3",
  "backend": "cursor",
  "cwd": "/path/where/it/ran",
  "model": "composer-2.5",
  "argv": ["cursor-agent", "--print", "--output-format", "stream-json", "..."],
  "prompt": "the user prompt",
  "started_at": "2026-07-01T15:30:00.000Z"
}
```

## Prompt input

`exec` and `start` accept a prompt in three equivalent ways. The resolved text is stored in `meta.json` and passed to `cursor-agent` as an inline argument — the wrapper resolves stdin and file input itself for uniform behavior.

**Inline positional** (default):

```bash
cursor-sub exec "Fix the bug in src/main.ts"
```

**Stdin** — use `-` as the positional prompt and pipe text to stdin:

```bash
echo "Summarize this module" | cursor-sub exec -
cursor-sub start - --mode plan < task.txt
```

If stdin is a TTY or the piped content is empty/whitespace-only, the CLI exits `1` with a JSON error.

**File** — `--prompt-file <path>` reads the prompt from disk (CLI-owned flag; not passed through to `cursor-agent`):

```bash
cursor-sub exec --prompt-file ./task.txt
cursor-sub start --prompt-file ./task.txt --mode plan
```

Missing or unreadable files exit `1` with a JSON error naming the path. Providing both a non-`-` positional prompt and `--prompt-file`, or both `-` and `--prompt-file`, exits `1` with an ambiguity error.

For detached `start`, prompts larger than 32KB are written to `prompt.txt` in the session directory for `_runner` handoff; `meta.json` still records the full prompt text.

## `envelope.json` (result contract)

Written once when the run finishes. Also printed by `cursor-sub exec` and `cursor-sub result`.

```json
{
  "schema_version": 1,
  "backend": "cursor",
  "run_id": "20260701-153000-a1b2c3",
  "session_id": "<cursor chat/session id for --resume>",
  "model": "composer-2.5",
  "cwd": "/path/where/it/ran",
  "status": "ok",
  "exit_code": 0,
  "result": "<final assistant message text>",
  "usage": { "input_tokens": 100, "output_tokens": 50 },
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
| `backend` | `"cursor"` | Backend identifier |
| `run_id` | string | This CLI run's id |
| `session_id` | string \| null | Cursor's session id from the `result` event |
| `model` | string \| null | Model from the `system`/`init` event |
| `cwd` | string | Working directory |
| `status` | `"ok"` \| `"error"` | `"error"` when `exit_code !== 0` |
| `exit_code` | number | `cursor-agent` process exit code |
| `result` | string | Final assistant text message (best-effort on error) |
| `usage` | object \| null | Usage from the `result` event, verbatim |
| `duration_ms` | number | Wall-clock duration |
| `started_at` | ISO8601 | Run start time |
| `ended_at` | ISO8601 | Run end time |
| `stream_path` | string | Absolute path to `stream.jsonl` |
| `raw_path` | string | Absolute path to `raw.jsonl` |
| `stderr_path` | string | Absolute path to `stderr.log` |
| `error` | string (optional) | Present on failure: last 2KB of stderr |

The runner always writes an envelope, including on crash or non-zero exit.

## `stream.jsonl` — canonical events

One JSON object per line. Every event includes `"ts"` (ISO8601, stamped at receipt).

### Event types

#### `message`

Assistant text output.

```json
{ "t": "message", "role": "assistant", "text": "...", "ts": "2026-07-01T15:30:01.000Z" }
```

Mapped from raw `type: "assistant"` events with `message.content[].type == "text"`.

#### `reasoning`

Model reasoning / thinking text.

```json
{ "t": "reasoning", "text": "...", "ts": "2026-07-01T15:30:01.000Z" }
```

Mapped from raw `type: "assistant"` events with `message.content[].type == "thinking"`.

#### `tool_call`

Tool invocation started.

```json
{ "t": "tool_call", "name": "Read", "args": { "path": "/foo" }, "call_id": "...", "ts": "..." }
```

Mapped from raw `type: "tool_call", subtype: "started"`. Tool names are normalized:

| Raw key | Canonical name |
|---------|----------------|
| `readToolCall` | `Read` |
| `shellToolCall` | `Bash` |
| `editToolCall` | `Edit` |
| `deleteToolCall` | `Delete` |
| `globToolCall` | `Glob` |
| `grepToolCall` | `Grep` |
| other `*ToolCall` | key with `ToolCall` suffix removed |

For `shellToolCall`, `args` is `{ command, description, workingDirectory }`.

#### `tool_result`

Tool invocation completed.

```json
{ "t": "tool_result", "name": "Read", "ok": true, "output": "...", "call_id": "...", "ts": "..." }
```

Mapped from raw `type: "tool_call", subtype: "completed"`. Output is truncated at 10KB with `"...[truncated at 10KB]"` appended and `"truncated": true` set.

#### `usage`

Token / resource usage from the final result event.

```json
{ "t": "usage", "data": { "input_tokens": 100 }, "ts": "..." }
```

Mapped from raw `type: "result"` → `.usage`.

#### `lifecycle`

Run boundaries and metadata.

```json
{ "t": "lifecycle", "event": "start", "data": { "model": "composer-2.5" }, "ts": "..." }
{ "t": "lifecycle", "event": "end", "data": { "session_id": "...", "is_error": false }, "ts": "..." }
```

- `start` — from raw `type: "system", subtype: "init"`
- `end` — from raw `type: "result"`

#### `other`

Unknown or unmapped raw event types are never dropped.

```json
{ "t": "other", "raw_type": "weird_event", "data": { "...": "..." }, "ts": "..." }
```

## `raw.jsonl`

Verbatim JSON lines from `cursor-agent --output-format stream-json`, after stripping non-JSON noise. See the [cursor-result jq selectors](https://github.com) for the authoritative raw field names:

- Assistant text: `.type == "assistant"` → `.message.content[] | select(.type == "text")`
- Reasoning: `.message.content[] | select(.type == "thinking")`
- Tool calls: `.type == "tool_call"` with `.subtype` `started` / `completed`
- Session id: `.type == "result"` → `.session_id`
- Model: `.type == "system" and .subtype == "init"` → `.model`
- Usage: `.type == "result"` → `.usage`

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Usage / CLI error (includes missing `cursor-agent`) |
| `2` | Subagent run failed (`envelope.status == "error"`) |
| `3` | Result not ready (`cursor-sub result` while still running) |
| `4` | Wait timeout (`cursor-sub result --wait --timeout`) |

## Versioning

- `schema_version: 1` applies to `meta.json`, `envelope.json`, and canonical `stream.jsonl` events.
- Breaking changes to file layout or event shapes increment `schema_version`.
- Unknown fields in JSON objects should be preserved by readers where possible.
