# grok-sub

Thin CLI wrapper around the local `grok` CLI with a documented file substrate. Output is machine-readable JSON by default.

**Self-onboarding:** run `grok-subagent` with no arguments, or `grok-subagent --help`, for the complete agent-facing page. Use `grok-subagent docs schema` for the file contract.

See [SCHEMA.md](./SCHEMA.md) for the maintained schema reference (`schema_version: 1`).

## Install

From the monorepo root:

```bash
pnpm install
pnpm -r build
cd packages/grok-sub
pnpm link --global
```

Requires Node.js >= 20 and `grok` on your `PATH`.

## Synchronous run

```bash
grok-subagent exec "Fix the bug in src/main.ts"
```

Prints the envelope JSON to stdout. Use `--text` for only the accumulated assistant text:

```bash
grok-subagent exec "Summarize this repo" --text
```

Prompts can also come from stdin or a file:

```bash
echo "Summarize this module" | grok-subagent exec -
grok-subagent exec --prompt-file ./task.txt
grok-subagent start - --permission-mode plan < large-task.txt
```

Passthrough flags after the prompt go to `grok` verbatim:

```bash
grok-subagent exec "Plan the migration" --permission-mode plan
grok-subagent exec "Continue work" --resume <session-id>
grok-subagent exec "Use explicit model" --model grok-build
grok-subagent exec "Limit tools" --tools read_file,grep
grok-subagent exec "Full flags" -- --session-id <id>
```

The wrapper invokes `grok -p <prompt> --output-format streaming-json`. It appends `--always-approve` by default unless you pass an approval posture such as `--permission-mode`, `--allow`, `--deny`, `--always-approve`, or `--yolo`.

## Async start, status, result

```bash
grok-subagent start "Refactor the auth module"
# {"run_id":"20260701-153000-a1b2c3","dir":"/Users/you/.subagent-clis/grok/sessions/20260701-153000-a1b2c3"}

grok-subagent status 20260701-153000-a1b2c3
# {"run_id":"...","running":true,"events":12,"last_event_ts":"...","has_envelope":false}

grok-subagent result 20260701-153000-a1b2c3 --wait
```

## Self-service with jq

Read canonical events directly:

```bash
RUN=20260701-153000-a1b2c3
STREAM="$HOME/.subagent-clis/grok/sessions/$RUN/stream.jsonl"

jq -r 'select(.t == "message") | .text' "$STREAM"
jq -r 'select(.t == "reasoning") | .text' "$STREAM"
jq -c 'select(.t == "error")' "$STREAM"
jq -c 'select(.t == "other") | {raw_type, data}' "$STREAM"
```

Current Grok streaming-json reports `text`, `thought`, `end`, `error`, and occasional control events. It does not report usage/cost or resolved model, so `envelope.usage` is usually `null` and `envelope.model` is populated only from `--model`.

## Other verbs

| Verb | Output |
|------|--------|
| `last [run_id]` | Accumulated assistant text |
| `messages [run_id]` | Assistant text chunks, separated by `---` |
| `tools [run_id]` | `tool_call` / `tool_result` events as JSONL, if mapped |
| `list [-n 10]` | Recent runs as JSONL |
| `docs [topic]` | Embedded docs: `schema`, `events`, `examples` |

## Session storage

Default: `~/.subagent-clis/grok/sessions/<run_id>/`

Override with `--dir <path>` or `GROK_SUB_HOME`.

Each run directory contains `meta.json`, `raw.jsonl`, `stream.jsonl`, `stderr.log`, `pid`, and `envelope.json`. See [SCHEMA.md](./SCHEMA.md) for the full contract.
