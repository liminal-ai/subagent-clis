# codex-sub

Thin CLI wrapper around local [`codex`](https://developers.openai.com/codex/cli) with a documented file substrate. Output is machine-readable JSON by default.

**Self-onboarding:** run `codex-subagent` with no arguments (or `codex-subagent --help`) for the complete agent-facing onboarding page. Use `codex-subagent docs schema` for the full file contract.

See [SCHEMA.md](./SCHEMA.md) for the maintained schema reference (`schema_version: 1`).

## Install

From the monorepo root:

```bash
pnpm install
pnpm -r build
cd packages/codex-sub
pnpm link --global
```

Requires Node.js >= 20 and `codex` on your `PATH`.

## Synchronous run

```bash
codex-subagent exec "Fix the bug in src/main.ts"
```

Prints the envelope JSON to stdout. Use `--text` for only the final assistant message:

```bash
codex-subagent exec "Summarize this repo" --text
```

Prompts can also come from stdin or a file:

```bash
echo "Summarize this module" | codex-subagent exec -
codex-subagent exec --prompt-file ./task.txt
codex-subagent start - -s read-only < large-task.txt
```

Use `-` as the positional prompt to read from stdin (must be piped). `--prompt-file` reads from disk. Both resolve to inline prompt text before invoking `codex`.

Passthrough flags after the prompt go to `codex` verbatim (no `--` separator required). An explicit `--` also works:

```bash
codex-subagent exec "Plan the migration" -s read-only
codex-subagent exec "Continue work" --resume <thread-id>
codex-subagent exec "Skip git check" --skip-git-repo-check
codex-subagent exec "Full auto" -- --full-auto
```

Only `--json` is appended automatically. Model, reasoning effort, and sandbox come from `~/.codex/config.toml`.

## Async start → status → result

```bash
# Start detached (returns immediately)
codex-subagent start "Refactor the auth module"
# {"run_id":"20260701-153000-a1b2c3","dir":"/Users/you/.subagent-clis/codex/sessions/20260701-153000-a1b2c3"}

# Cheap poll
codex-subagent status 20260701-153000-a1b2c3
# {"run_id":"...","running":true,"events":12,"last_event_ts":"...","has_envelope":false}

# Wait for completion
codex-subagent result 20260701-153000-a1b2c3 --wait
```

## Self-service with jq

Read canonical events directly — no verb required:

```bash
RUN=20260701-153000-a1b2c3
STREAM="$HOME/.subagent-clis/codex/sessions/$RUN/stream.jsonl"

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

Default: `~/.subagent-clis/codex/sessions/`

Override with `--dir <path>` or `CODEX_SUB_HOME`.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | ok |
| 1 | usage / CLI error |
| 2 | run failed |
| 3 | result not ready |
| 4 | wait timeout |
