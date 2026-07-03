# cursor-sub

Thin CLI wrapper around local [`cursor-agent`](https://cursor.com/docs/cli) with a documented file substrate. Output is machine-readable JSON by default.

**Self-onboarding:** run `cursor-sub` with no arguments (or `cursor-sub --help`) for the complete agent-facing onboarding page. Use `cursor-sub docs schema` for the full file contract.

See [SCHEMA.md](./SCHEMA.md) for the maintained schema reference (`schema_version: 1`).

## Install

From the monorepo root:

```bash
pnpm install
pnpm -r build
cd packages/cursor-sub
pnpm link --global
```

Requires Node.js >= 20 and `cursor-agent` on your `PATH`.

## Synchronous run

```bash
cursor-sub exec "Fix the bug in src/main.ts"
```

Prints the envelope JSON to stdout. Use `--text` for only the final assistant message:

```bash
cursor-sub exec "Summarize this repo" --text
```

Prompts can also come from stdin or a file:

```bash
echo "Summarize this module" | cursor-sub exec -
cursor-sub exec --prompt-file ./task.txt
cursor-sub start - --mode plan < large-task.txt
```

Use `-` as the positional prompt to read from stdin (must be piped). `--prompt-file` reads from disk. Both resolve to inline prompt text before invoking `cursor-agent`.

Passthrough flags after the prompt go to `cursor-agent` verbatim (no `--` separator required). An explicit `--` also works:

```bash
cursor-sub exec "Plan the migration" --mode plan
cursor-sub exec "Continue work" --resume <cursor-session-id>
cursor-sub exec "Ask only" -- --mode ask
```

Defaults added unless you already supply them: `--model composer-2.5 --trust --force --sandbox disabled`. In plan/ask mode, `--force` and `--sandbox disabled` are omitted.

## Async start → status → result

```bash
# Start detached (returns immediately)
cursor-sub start "Refactor the auth module"
# {"run_id":"20260701-153000-a1b2c3","dir":"/Users/you/.subagent-clis/cursor/sessions/20260701-153000-a1b2c3"}

# Cheap poll
cursor-sub status 20260701-153000-a1b2c3
# {"run_id":"...","running":true,"events":12,"last_event_ts":"...","has_envelope":false}

# Wait for completion
cursor-sub result 20260701-153000-a1b2c3 --wait
```

## Self-service with jq

Read canonical events directly — no verb required:

```bash
RUN=20260701-153000-a1b2c3
STREAM="$HOME/.subagent-clis/cursor/sessions/$RUN/stream.jsonl"

# All tool calls
jq -c 'select(.t == "tool_call")' "$STREAM"

# Reasoning blocks
jq -r 'select(.t == "reasoning") | .text' "$STREAM"
```

## Other verbs

| Verb | Output |
|------|--------|
| `last [run_id]` | Final assistant message (plain text) |
| `messages [run_id]` | All assistant messages, separated by `---` |
| `tools [run_id]` | `tool_call` / `tool_result` events as JSONL |
| `list [-n 10]` | Recent runs as JSONL |

## Sessions root

Default: `~/.subagent-clis/cursor/sessions/`

Override with `--dir <path>` or `CURSOR_SUB_HOME`.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | ok |
| 1 | usage / CLI error |
| 2 | run failed |
| 3 | result not ready |
| 4 | wait timeout |
