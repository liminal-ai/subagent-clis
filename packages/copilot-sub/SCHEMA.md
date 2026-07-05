# copilot-sub schema

`schema_version: 1`

This package wraps the local `copilot` CLI in headless mode and records a stable file substrate for agents. The wrapper invokes:

```bash
copilot -p <prompt> --output-format json --allow-all-tools --no-auto-update --no-ask-user [passthrough flags...]
```

`-p` takes the prompt as its value. `--allow-all-tools` is required by Copilot for non-interactive mode. `--no-auto-update` prevents mid-run backend updates, and `--no-ask-user` disables a tool this wrapper cannot answer. `--resume <session_id>` and `-r <session_id>` pass through, but missing or flag-valued resume ids are usage errors.

## Session Directory

Default wrapper root:

```text
~/.subagent-clis/copilot/sessions/<run_id>/
```

Override with `--dir <path>` or `COPILOT_SUB_HOME`. This only changes wrapper storage; Copilot keeps its own backend-side auth, logs, and session state under `~/.copilot`.

Files:

| File | Written | Contents |
|------|---------|----------|
| `meta.json` | At spawn | Prompt, cwd, argv, argv model fallback, start time |
| `raw.jsonl` | During run | Verbatim Copilot stdout lines |
| `stream.jsonl` | During run | Canonical mapped events with `ts` |
| `stderr.log` | During run | Copilot stderr and runner bootstrap errors |
| `pid` | At spawn | Runner process PID |
| `envelope.json` | On completion | Final result contract |

## `meta.json`

```json
{
  "schema_version": 1,
  "run_id": "20260701-153000-a1b2c3",
  "backend": "copilot",
  "cwd": "/repo",
  "model": "gpt-5.5",
  "argv": ["copilot", "-p", "<prompt>", "--output-format", "json", "--allow-all-tools", "--no-auto-update", "--no-ask-user"],
  "prompt": "<prompt>",
  "started_at": "2026-07-01T15:30:00.000Z"
}
```

`meta.model` is the explicit `--model <id>` fallback when supplied. The final envelope prefers the model Copilot reports in the stream.

## `envelope.json`

Written once when the run finishes. Also printed by `copilot-subagent exec` and `copilot-subagent result`.

```json
{
  "schema_version": 1,
  "backend": "copilot",
  "run_id": "20260701-153000-a1b2c3",
  "session_id": "166e0fea-0453-4e57-bccb-f41c3b4f24ea",
  "model": "gpt-5.5",
  "cwd": "/repo",
  "status": "ok",
  "exit_code": 0,
  "result": "Final assistant text",
  "usage": {
    "premiumRequests": 7.5,
    "totalApiDurationMs": 3079,
    "sessionDurationMs": 4263,
    "codeChanges": { "linesAdded": 0, "linesRemoved": 0, "filesModified": [] }
  },
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
| `session_id` | string \| null | From Copilot final `result.sessionId` |
| `model` | string \| null | Stream-reported model, falling back to argv `--model` |
| `status` | `"ok"` \| `"error"` | `"error"` when effective `exit_code !== 0` or an error event was seen |
| `exit_code` | number | Copilot final `result.exitCode` when present, otherwise process exit code |
| `result` | string | Last non-empty `assistant.message.data.content` |
| `usage` | object \| null | Copilot final `result.usage` verbatim, including `premiumRequests` |
| `error` | string | Present on failed runs when stderr tail is available |

## Raw Stream

Current Copilot headless JSONL emits objects like:

```json
{"type":"session.tools_updated","data":{"model":"gpt-5.5"}}
{"type":"assistant.message_delta","data":{"messageId":"msg","deltaContent":"hi"},"ephemeral":true}
{"type":"assistant.message","data":{"messageId":"msg","model":"gpt-5.5","content":"hi","toolRequests":[]}}
{"type":"tool.execution_start","data":{"toolCallId":"call_1","toolName":"bash","arguments":{"command":"echo hi"}}}
{"type":"tool.execution_complete","data":{"toolCallId":"call_1","success":true,"result":{"content":"hi\n<shellId: 0 completed with exit code 0>"}}}
{"type":"result","sessionId":"abc123","exitCode":0,"usage":{"premiumRequests":7.5}}
```

Unknown events are never dropped.

## Canonical Events

Every parsed JSON line maps to one or more canonical `stream.jsonl` events. Non-JSON stdout is preserved in `raw.jsonl` and skipped from `stream.jsonl`.

### `lifecycle`

```json
{"t":"lifecycle","event":"start","data":{"session_id":null,"model":"gpt-5.5"},"ts":"..."}
{"t":"lifecycle","event":"end","data":{"session_id":"abc123","exit_code":0},"ts":"..."}
```

`start` is synthetic on the first meaningful non-session event. `end` maps from raw `type: "result"`.

### `message`

```json
{"t":"message","role":"assistant","text":"Final assistant text","ts":"..."}
```

Mapped from non-empty `assistant.message.data.content`. Deltas map to `other` to avoid duplicating final content.

### `reasoning`

```json
{"t":"reasoning","text":"Brief reasoning summary","ts":"..."}
```

Mapped from non-empty `assistant.reasoning.data.content`.

### `tool_call` / `tool_result`

```json
{"t":"tool_call","name":"bash","args":{"command":"echo hi"},"call_id":"call_1","ts":"..."}
{"t":"tool_result","name":"bash","ok":true,"output":"hi\n<shellId: 0 completed with exit code 0>","call_id":"call_1","ts":"..."}
```

Tool result output is truncated at 10KB with `truncated:true`.

### `usage`

```json
{"t":"usage","data":{"premiumRequests":7.5},"ts":"..."}
```

Mapped from final `result.usage`.

### `error`

```json
{"t":"error","message":"Authentication failed","data":{"type":"error","message":"Authentication failed"},"ts":"..."}
```

Mapped from raw `type: "error"` or `*.error`. Sets envelope status to `"error"`.

### `other`

```json
{"t":"other","raw_type":"assistant.message_delta","data":{"type":"assistant.message_delta"},"ts":"..."}
```

Mapped from control, housekeeping, partial, user, empty assistant, and unknown events.

## Useful Raw Selectors

```bash
jq -r 'select(.type == "result") | .sessionId' raw.jsonl
jq -r 'select(.type == "assistant.message") | .data.content' raw.jsonl
jq -c 'select(.type == "tool.execution_start")' raw.jsonl
jq -c 'select(.type == "tool.execution_complete")' raw.jsonl
jq -c 'select(.type == "result") | .usage' raw.jsonl
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Usage / CLI error, including missing `copilot` |
| `2` | Subagent run failed (`envelope.status == "error"`) |
| `3` | Result not ready (`copilot-subagent result` while still running) |
| `4` | Wait timeout (`copilot-subagent result --wait --timeout`) |
