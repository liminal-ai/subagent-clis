# claude-sub

Thin CLI wrapper around local [`claude`](https://docs.anthropic.com/en/docs/claude-code) (Claude Code) with a documented file substrate. Output is machine-readable JSON by default.

**Self-onboarding:** run `claude-subagent` with no arguments (or `claude-subagent --help`) for the complete agent-facing onboarding page. Use `claude-subagent docs schema` for the full file contract.

See [SCHEMA.md](./SCHEMA.md) for the maintained schema reference (`schema_version: 1`).

## Install

From the monorepo root:

```bash
pnpm install
pnpm -r build
cd packages/claude-sub
pnpm link --global
```

Requires Node.js >= 20 and `claude` on your `PATH`.

## Synchronous run

```bash
claude-subagent exec "Fix the bug in src/main.ts"
```

Prints the envelope JSON to stdout. Use `--text` for only the final assistant message:

```bash
claude-subagent exec "Summarize this repo" --text
```

Prompts can also come from stdin or a file:

```bash
echo "Summarize this module" | claude-subagent exec -
claude-subagent exec --prompt-file ./task.txt
claude-subagent start - --permission-mode plan < large-task.txt
```

Use `-` as the positional prompt to read from stdin (must be piped). `--prompt-file` reads from disk. Both resolve to inline prompt text before invoking `claude`.

Passthrough flags after the prompt go to `claude` verbatim (no `--` separator required). An explicit `--` also works:

```bash
claude-subagent exec "Plan the migration" --permission-mode plan
claude-subagent exec "Continue work" --resume <session-id>
claude-subagent exec "Use haiku" --model haiku
claude-subagent exec "Extra context" --add-dir /path/to/docs
claude-subagent exec "Full flags" -- --continue
```

`-p --output-format stream-json --verbose` are appended automatically. `--dangerously-skip-permissions` is appended unless you pass your own permission posture (`--permission-mode`, `--allowed-tools`, etc.).

## Async start → status → result

```bash
# Start detached (returns immediately)
claude-subagent start "Refactor the auth module"
# {"run_id":"20260701-153000-a1b2c3","dir":"/Users/you/.subagent-clis/claude/sessions/20260701-153000-a1b2c3"}

# Cheap poll
claude-subagent status 20260701-153000-a1b2c3
# {"run_id":"...","running":true,"events":12,"last_event_ts":"...","has_envelope":false}

# Wait for completion
claude-subagent result 20260701-153000-a1b2c3 --wait
```

## Self-service with jq

Read canonical events directly — no verb required:

```bash
RUN=20260701-153000-a1b2c3
STREAM="$HOME/.subagent-clis/claude/sessions/$RUN/stream.jsonl"

# All tool calls
jq -c 'select(.t == "tool_call")' "$STREAM"

# Reasoning blocks
jq -r 'select(.t == "reasoning") | .text' "$STREAM"

# Cost from usage event
jq 'select(.t == "usage") | .data.total_cost_usd' "$STREAM"
```

## Other verbs

| Verb | Output |
|------|--------|
| `last [run_id]` | Final assistant message (plain text) |
| `messages [run_id]` | All assistant messages, separated by `---` |
| `tools [run_id]` | `tool_call` / `tool_result` events as JSONL |
| `list [-n 10]` | Recent runs as JSONL |
| `docs [topic]` | Embedded docs: `schema`, `events`, `examples` |

## Session storage

Default: `~/.subagent-clis/claude/sessions/<run_id>/`

Override with `--dir <path>` or `CLAUDE_SUB_HOME`.

Each run directory contains `meta.json`, `raw.jsonl`, `stream.jsonl`, `stderr.log`, `pid`, and `envelope.json`. See [SCHEMA.md](./SCHEMA.md) for the full contract.
