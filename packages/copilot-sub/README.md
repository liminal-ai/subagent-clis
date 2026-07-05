# copilot-sub

Thin CLI wrapper around the local `copilot` CLI with a documented file substrate. Output is machine-readable JSON by default.

Self-onboarding: run `copilot-subagent` with no arguments, or `copilot-subagent --help`. Use `copilot-subagent docs schema` for the file contract.

See [SCHEMA.md](./SCHEMA.md) for the maintained schema reference (`schema_version: 1`).

## Install

From the monorepo root:

```bash
pnpm install
pnpm -r build
cd packages/copilot-sub
pnpm link --global
```

Requires Node.js >= 20 and `copilot` on your `PATH`.

## Synchronous Run

```bash
copilot-subagent exec "Fix the bug in src/main.ts"
```

Use `--text` for only the final assistant text:

```bash
copilot-subagent exec "Summarize this repo" --text
```

Prompts can also come from stdin or a file:

```bash
echo "Summarize this module" | copilot-subagent exec -
copilot-subagent exec --prompt-file ./task.txt
copilot-subagent start - --mode plan < large-task.txt
```

Passthrough flags after the prompt go to `copilot` verbatim:

```bash
copilot-subagent exec "Plan the migration" --mode plan
copilot-subagent exec "Continue work" --resume <session-id>
copilot-subagent exec "Use explicit model" --model gpt-5.5
copilot-subagent exec "Limit tools" --available-tools bash,read
copilot-subagent exec "Allow shell" --allow-tool bash
```

The wrapper invokes `copilot -p <prompt> --output-format json` and appends `--allow-all-tools`, `--no-auto-update`, and `--no-ask-user` unless already supplied. `--allow-all-tools` is required by Copilot for non-interactive `-p` mode.

## Async Start, Status, Result

```bash
copilot-subagent start "Refactor the auth module"
# {"run_id":"20260701-153000-a1b2c3","dir":"/Users/you/.subagent-clis/copilot/sessions/20260701-153000-a1b2c3"}

copilot-subagent status 20260701-153000-a1b2c3
copilot-subagent result 20260701-153000-a1b2c3 --wait
```

## Self-Service With jq

```bash
RUN=20260701-153000-a1b2c3
STREAM="$HOME/.subagent-clis/copilot/sessions/$RUN/stream.jsonl"

jq -r 'select(.t == "message") | .text' "$STREAM"
jq -c 'select(.t == "tool_call" or .t == "tool_result")' "$STREAM"
jq -c 'select(.t == "usage") | .data' "$STREAM"
jq -c 'select(.t == "error")' "$STREAM"
```

Copilot JSONL reports the backend session id and usage in the final `result` event. `envelope.usage` is copied verbatim, including `premiumRequests`.

## Other Verbs

| Verb | Output |
|------|--------|
| `last [run_id]` | Final assistant text |
| `messages [run_id]` | Assistant messages, separated by `---` |
| `tools [run_id]` | `tool_call` / `tool_result` events as JSONL |
| `list [-n 10]` | Recent runs as JSONL |
| `docs [topic]` | Embedded docs: `schema`, `events`, `examples` |

## Session Storage

Default wrapper root: `~/.subagent-clis/copilot/sessions/<run_id>/`

Override with `--dir <path>` or `COPILOT_SUB_HOME`. Copilot also maintains its own auth/session/log state under `~/.copilot`.

Each run directory contains `meta.json`, `raw.jsonl`, `stream.jsonl`, `stderr.log`, `pid`, and `envelope.json`. See [SCHEMA.md](./SCHEMA.md) for the full contract.
