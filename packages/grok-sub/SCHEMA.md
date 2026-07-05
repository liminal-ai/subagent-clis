# grok-sub schema

`schema_version: 1`

This package wraps the local `grok` CLI in headless mode and records a stable file substrate for agents. The wrapper invokes:

```bash
grok -p <prompt> --output-format streaming-json [approval/default flags...] [passthrough flags...]
```

`-p` takes the prompt as its value. `--always-approve` is appended by default unless the caller supplies an approval posture (`--permission-mode`, `--allow`, `--deny`, `--always-approve`, or `--yolo`). `--resume <session_id>` and `-r <session_id>` pass through, but this wrapper treats a missing or flag-valued resume id as a usage error.

## Session Directory

Default root:

```text
~/.subagent-clis/grok/sessions/<run_id>/
```

Override the root with `--dir <path>` or `GROK_SUB_HOME`. This only changes wrapper storage; it does not change the run cwd.

Files:

| File | Written | Contents |
|------|---------|----------|
| `meta.json` | At spawn | Prompt, cwd, argv, explicit model, start time |
| `raw.jsonl` | During run | Verbatim Grok stdout lines |
| `stream.jsonl` | During run | Canonical mapped events with `ts` |
| `stderr.log` | During run | Grok stderr and runner bootstrap errors |
| `pid` | At spawn | Runner process PID |
| `envelope.json` | On completion | Final result contract |

## `meta.json`

```json
{
  "schema_version": 1,
  "run_id": "20260701-153000-a1b2c3",
  "backend": "grok",
  "cwd": "/repo",
  "model": "grok-build",
  "argv": ["grok", "-p", "<prompt>", "--output-format", "streaming-json", "--always-approve"],
  "prompt": "<prompt>",
  "started_at": "2026-07-01T15:30:00.000Z"
}
```

`model` is set only when `--model <id>` or `-m <id>` is passed. Grok streaming-json does not report the resolved default model.

## `envelope.json`

Written once when the run finishes. Also printed by `grok-subagent exec` and `grok-subagent result`.

```json
{
  "schema_version": 1,
  "backend": "grok",
  "run_id": "20260701-153000-a1b2c3",
  "session_id": "abc123",
  "model": null,
  "cwd": "/repo",
  "status": "ok",
  "exit_code": 0,
  "result": "Final assistant text",
  "usage": null,
  "duration_ms": 1234,
  "started_at": "2026-07-01T15:30:00.000Z",
  "ended_at": "2026-07-01T15:30:01.234Z",
  "stream_path": "/abs/.../stream.jsonl",
  "raw_path": "/abs/.../raw.jsonl",
  "stderr_path": "/abs/.../stderr.log"
}
```

Fields:

| Field | Type | Notes |
|-------|------|-------|
| `session_id` | string \| null | From Grok `end.sessionId` |
| `model` | string \| null | From explicit argv `--model`/`-m` only |
| `status` | `"ok"` \| `"error"` | `"error"` when `exit_code !== 0` or an `error` event was seen |
| `result` | string | Accumulated `text.data` deltas |
| `usage` | object \| null | Current Grok streaming-json does not report usage/cost, so normally `null` |
| `error` | string | Present on failed runs when stderr tail is available |

## Raw Stream

Current Grok headless streaming-json emits newline-delimited objects like:

```json
{"type":"text","data":"Here's"}
{"type":"text","data":" a summary"}
{"type":"thought","data":"Analyzing the directory structure..."}
{"type":"end","stopReason":"EndTurn","sessionId":"abc123","requestId":"xyz789"}
```

It may also emit `error`, `max_turns_reached`, and `auto_compact_*` events. Unknown events are never dropped.

## Canonical Events

Every parsed JSON line maps to one or more canonical `stream.jsonl` events. Non-JSON stdout is preserved in `raw.jsonl` and skipped from `stream.jsonl`.

### `lifecycle`

```json
{"t":"lifecycle","event":"start","data":{"session_id":null,"model":null},"ts":"..."}
{"t":"lifecycle","event":"end","data":{"stop_reason":"EndTurn","session_id":"abc123","request_id":"xyz789"},"ts":"..."}
```

`start` is synthetic on the first parsed JSON event because Grok has no start event. `end` maps from raw `type: "end"`.

### `message`

```json
{"t":"message","role":"assistant","text":" a summary","ts":"..."}
```

Mapped from raw `type: "text"`. `text` is a delta chunk; the envelope result is the accumulated text.

### `reasoning`

```json
{"t":"reasoning","text":"Analyzing...","ts":"..."}
```

Mapped from raw `type: "thought"`.

### `error`

```json
{"t":"error","message":"Authentication failed","data":{"type":"error","message":"Authentication failed"},"ts":"..."}
```

Mapped from raw `type: "error"`. Sets envelope status to `"error"` even if the process exits 0.

### `other`

```json
{"t":"other","raw_type":"max_turns_reached","data":{"type":"max_turns_reached"},"ts":"..."}
```

Mapped from unknown or control events such as `max_turns_reached` and `auto_compact_*`.

### Reserved Event Types

The canonical vocabulary also reserves `tool_call`, `tool_result`, and `usage` for parity with sibling packages. Current Grok streaming-json does not expose tool calls/results or usage, so these are normally absent.

## Useful Raw Selectors

```bash
# Session id
jq -r 'select(.type == "end") | .sessionId' raw.jsonl

# Text deltas
jq -r 'select(.type == "text") | .data' raw.jsonl

# Thoughts
jq -r 'select(.type == "thought") | .data' raw.jsonl

# Errors
jq -c 'select(.type == "error")' raw.jsonl
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Usage / CLI error, including missing `grok` |
| `2` | Subagent run failed (`envelope.status == "error"`) |
| `3` | Result not ready (`grok-subagent result` while still running) |
| `4` | Wait timeout (`grok-subagent result --wait --timeout`) |
