# codex-sub file & event contract

`schema_version: 1`

This document is the API for the `codex-subagent` CLI substrate. Verbs are convenience wrappers; agents may read these files directly.

## Session directory layout

Each run gets an isolated directory:

```
~/.subagent-clis/codex/sessions/<run_id>/
```

Override the sessions root with `--dir <path>` or the `CODEX_SUB_HOME` environment variable.

### `run_id` format

Generated at start: `<yyyymmdd-hhmmss>-<6 hex chars>`

Example: `20260701-153000-a1b2c3`

This is the primary handle for `codex-subagent` commands. Codex's own thread id is stored separately in the envelope as `session_id` (for `--resume`).

### Files

| File | Written | Description |
|------|---------|-------------|
| `meta.json` | At spawn | Run metadata (prompt, argv, cwd, model, started_at) |
| `raw.jsonl` | During run | Verbatim `codex exec --json` events |
| `stream.jsonl` | During run | Canonical mapped events (see below) |
| `stderr.log` | During run | `codex` stderr |
| `pid` | At spawn | PID of the runner process while running |
| `envelope.json` | On completion | Final result contract (see below) |

`pid` is not deleted on exit. Liveness is checked via `kill(pid, 0)` against the **runner** process (the `codex-subagent` worker, not the `codex` child). Once `envelope.json` exists, the run is considered complete regardless of `pid`. If there is no `pid` file and no envelope, the run is not running (crashed or never started).

`raw.jsonl` and `stream.jsonl` are appended incrementally as events arrive from `codex`, so `codex-subagent status` can report live `events` counts and `last_event_ts` while a run is in progress.

## `meta.json`

Written when the run starts:

```json
{
  "schema_version": 1,
  "run_id": "20260701-153000-a1b2c3",
  "backend": "codex",
  "cwd": "/path/where/it/ran",
  "model": null,
  "argv": ["codex", "exec", "--json", "..."],
  "prompt": "the user prompt",
  "started_at": "2026-07-01T15:30:00.000Z"
}
```

`model` is set only when `-m` / `--model` is passed through; otherwise null (Codex uses `~/.codex/config.toml`).

## Prompt input

`exec` and `start` accept a prompt in three equivalent ways. The resolved text is stored in `meta.json` and passed to `codex` as an inline argument — the wrapper resolves stdin and file input itself for uniform behavior (Codex's native stdin prompt is not used).

**Inline positional** (default):

```bash
codex-subagent exec "Fix the bug in src/main.ts"
```

**Stdin** — use `-` as the positional prompt and pipe text to stdin:

```bash
echo "Summarize this module" | codex-subagent exec -
codex-subagent start - -s read-only < task.txt
```

If stdin is a TTY or the piped content is empty/whitespace-only, the CLI exits `1` with a JSON error.

**File** — `--prompt-file <path>` reads the prompt from disk (CLI-owned flag; not passed through to `codex`):

```bash
codex-subagent exec --prompt-file ./task.txt
codex-subagent start --prompt-file ./task.txt -s read-only
```

Missing or unreadable files exit `1` with a JSON error naming the path. Providing both a non-`-` positional prompt and `--prompt-file`, or both `-` and `--prompt-file`, exits `1` with an ambiguity error.

For detached `start`, prompts larger than 32KB are written to `prompt.txt` in the session directory for `_runner` handoff; `meta.json` still records the full prompt text.

## `envelope.json` (result contract)

Written once when the run finishes. Also printed by `codex-subagent exec` and `codex-subagent result`.

```json
{
  "schema_version": 1,
  "backend": "codex",
  "run_id": "20260701-153000-a1b2c3",
  "session_id": "<thread_id from thread.started>",
  "model": null,
  "cwd": "/path/where/it/ran",
  "status": "ok",
  "exit_code": 0,
  "result": "<final assistant message text>",
  "usage": {
    "input_tokens": 100,
    "cached_input_tokens": 20,
    "output_tokens": 50
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
| `backend` | `"codex"` | Backend identifier |
| `run_id` | string | This CLI run's id |
| `session_id` | string \| null | `thread_id` from `thread.started` |
| `model` | string \| null | From `-m` passthrough if supplied |
| `cwd` | string | Working directory |
| `status` | `"ok"` \| `"error"` | `"error"` when `exit_code !== 0` |
| `exit_code` | number | `codex` process exit code |
| `result` | string | Final `agent_message` text (best-effort on error) |
| `usage` | object \| null | Usage from last `turn.completed`, verbatim |
| `duration_ms` | number | Wall-clock duration |
| `started_at` | ISO8601 | Run start time |
| `ended_at` | ISO8601 | Run end time |
| `stream_path` | string | Absolute path to `stream.jsonl` |
| `raw_path` | string | Absolute path to `raw.jsonl` |
| `stderr_path` | string | Absolute path to `stderr.log` |
| `error` | string (optional) | Present on failure: last 2KB of stderr |

The runner always writes an envelope, including on crash or non-zero exit.

## Codex invocation

Normal run:

```
codex exec --json "<prompt>" [passthrough flags...]
```

Resume (mapped from `--resume <session-id>` on exec/start):

```
codex exec resume --json <session-id> "<prompt>" [passthrough flags...]
```

Only `--json` is appended by default. All other flags pass through verbatim from the caller. Prompt text is always resolved by the wrapper CLI before invocation (see Prompt input above).

## Raw → canonical event mapping

Raw codex `--json` events (one JSON object per stdout line):

| Raw event | Canonical output |
|-----------|------------------|
| `thread.started` `{thread_id}` | `lifecycle` `{event:"start", data:{thread_id}}`; captures `session_id` |
| `turn.started` | `{t:"other", raw_type:"turn.started", data}` |
| `turn.completed` `{usage}` | `{t:"other", raw_type:"turn.completed", data}` plus `{t:"usage", data:{...}}` when usage present |
| `item.completed` `agent_message` `{item.text}` | `{t:"message", role:"assistant", text}` |
| `item.completed` `reasoning` `{item.text}` | `{t:"reasoning", text}` |
| `item.started` `command_execution` `{item.command}` | `{t:"tool_call", name:"shell", args:{command}}` |
| `item.completed` `command_execution` `{item.command, item.exit_code, item.aggregated_output}` | `{t:"tool_result", name:"shell", ok: exit_code===0, output}` (10KB truncation) |
| Anything else | `{t:"other", raw_type, data}` — never dropped |

Envelope `result` = text of the last `agent_message`. Envelope `usage` = usage object from the last `turn.completed`, verbatim, or null.

## `stream.jsonl` — canonical events

One JSON object per line. Every event includes `"ts"` (ISO8601, stamped at receipt).

### Event types

#### `message`

Assistant text output.

```json
{ "t": "message", "role": "assistant", "text": "...", "ts": "2026-07-01T15:30:01.000Z" }
```

Mapped from raw `type: "item.completed"` with `item.type == "agent_message"`.

#### `reasoning`

Model reasoning / thinking text.

```json
{ "t": "reasoning", "text": "...", "ts": "2026-07-01T15:30:01.000Z" }
```

Mapped from raw `type: "item.completed"` with `item.type == "reasoning"`.

#### `tool_call`

Shell command started.

```json
{ "t": "tool_call", "name": "shell", "args": { "command": "..." }, "ts": "..." }
```

Mapped from raw `type: "item.started"` with `item.type == "command_execution"`.

#### `tool_result`

Shell command completed.

```json
{ "t": "tool_result", "name": "shell", "ok": true, "output": "...", "ts": "..." }
```

Mapped from raw `type: "item.completed"` with `item.type == "command_execution"`. Output is truncated at 10KB with `"...[truncated at 10KB]"` appended and `"truncated": true` set.

#### `usage`

Token usage from `turn.completed`.

```json
{ "t": "usage", "data": { "input_tokens": 100, "cached_input_tokens": 20, "output_tokens": 50 }, "ts": "..." }
```

#### `lifecycle`

Run start boundary.

```json
{ "t": "lifecycle", "event": "start", "data": { "thread_id": "..." }, "ts": "..." }
```

Mapped from raw `type: "thread.started"`.

#### `other`

Unknown or auxiliary raw event types are never dropped.

```json
{ "t": "other", "raw_type": "turn.started", "data": { "...": "..." }, "ts": "..." }
```

Includes `turn.started`, `turn.completed`, and any unmapped raw types.

## `raw.jsonl`

Verbatim JSON lines from `codex exec --json`, after stripping non-JSON noise.

Key raw selectors:

- Session id: `.type == "thread.started"` → `.thread_id`
- Assistant text: `.type == "item.completed" and .item.type == "agent_message"` → `.item.text`
- Commands: `.type == "item.completed" and .item.type == "command_execution"`
- Usage: `.type == "turn.completed"` → `.usage`

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Usage / CLI error (includes missing `codex`) |
| `2` | Subagent run failed (`envelope.status == "error"`) |
| `3` | Result not ready (`codex-subagent result` while still running) |
| `4` | Wait timeout (`codex-subagent result --wait --timeout`) |

## Versioning

- `schema_version: 1` applies to `meta.json`, `envelope.json`, and canonical `stream.jsonl` events.
- Breaking changes to file layout or event shapes increment `schema_version`.
- Unknown fields in JSON objects should be preserved by readers where possible.
