# subagent-clis

Run coding agents as subagents. Each CLI here wraps a vendor's coding agent
(Claude Code, Codex, Cursor, Grok, GitHub Copilot) behind one consistent
interface: fire a prompt, get back a JSON envelope with the result, a session
id you can resume, and a session directory holding the full event stream.
Built for orchestration — one agent driving others — but just as usable from
a shell.

```bash
claude-subagent exec "Add input validation to parseConfig in src/config.ts"
codex-subagent  start "Refactor the auth middleware"     # detached; poll with status/result
cursor-subagent result --wait --timeout 300              # block until the envelope lands
```

Every wrapper has the same verbs (`exec`, `start`, `status`, `result`, `last`,
`messages`, `tools`, `list`, `stop`, `docs`), the same envelope schema, the
same exit codes, and a self-onboarding page when run with no arguments. Learn
one, you've learned all five.

| CLI | Wraps | Requires |
|---|---|---|
| `claude-subagent` | Claude Code (`claude`) | `claude` installed + authenticated |
| `codex-subagent` | OpenAI Codex (`codex`) | `codex` installed + authenticated |
| `cursor-subagent` | Cursor (`cursor-agent`) | `cursor-agent` installed + authenticated |
| `grok-subagent` | Grok CLI (`grok`) | `grok` installed + authenticated |
| `copilot-subagent` | GitHub Copilot CLI (`copilot`) | `copilot` installed + authenticated |

Runs call paid backends. Install only the wrappers whose backends you
actually use.

## Getting started (humans)

No npm package, no npx. You clone the repo and the bins run from it.

```bash
git clone <this-repo-url> && cd subagent-clis
```

Then fire up your coding agent of choice (Claude Code, Codex, whatever) inside
the repo and tell it:

> Read README.md and follow the agent setup instructions.

It will ask which wrappers you want, build them, and put them on your PATH.
When it's done, run any wrapper with no arguments to get its onboarding page.

Prefer doing it by hand? Follow the same steps below yourself — they're just
shell commands.

---

## Agent setup instructions

You are an agent setting this repo up on the user's machine. Work from the
repo root. Follow these steps in order.

### 1. Ask which wrappers to install

Ask the user which of the five subagent CLIs they want: **claude**, **codex**,
**cursor**, **grok**, **copilot**. Don't assume — many users want only one or
two (a Claude-only shop just wants `claude-subagent`). Install only what they
pick.

### 2. Check prerequisites

- `node` >= 20 and `pnpm` must be on PATH. If pnpm is missing, ask before
  installing it (`npm i -g pnpm` or `corepack enable`).
- For each selected wrapper, confirm its backend binary exists (`command -v
  claude` / `codex` / `cursor-agent` / `grok` / `copilot`). If a backend is
  missing, tell the user and skip that wrapper — do not install backends
  unprompted; they need vendor accounts and interactive logins.

### 3. Install and build

```bash
pnpm install
pnpm --filter <name>-sub build   # once per selected wrapper: claude-sub, codex-sub, cursor-sub, grok-sub, copilot-sub
```

(`pnpm -r build` builds everything; fine too if they picked most of them.)

### 4. Put the bins on PATH

Symlink each selected wrapper's built CLI into a directory on the user's
PATH. `~/.local/bin` is the default choice — create it and add it to PATH in
their shell profile if needed (ask first).

```bash
ln -sf "$(pwd)/packages/claude-sub/dist/cli.js" ~/.local/bin/claude-subagent
```

(The build already marks `dist/cli.js` executable.)

Repeat per wrapper: `codex-sub → codex-subagent`, `cursor-sub →
cursor-subagent`, `grok-sub → grok-subagent`, `copilot-sub →
copilot-subagent`. Do not use `pnpm link --global` — it requires a configured
pnpm global bin dir; plain symlinks always work.

### 5. Verify

For each installed wrapper:

1. `<name>-subagent` with no arguments must print its onboarding page (this
   also confirms the symlink and build).
2. Offer the user a live smoke test — it calls the paid backend, so ask
   first: `<name>-subagent exec "Reply with exactly: setup-ok"`. Expect a JSON
   envelope with `"status": "ok"` and `"result": "setup-ok"`.

### 6. Hand off

Tell the user which wrappers are installed and paste each one's one-line
usage (`<name>-subagent exec "<prompt>"`). Point them at `<name>-subagent
docs` for the envelope schema, event stream, and orchestration patterns
(resume, parallel runs in worktrees).

Updating later: `git pull && pnpm install && pnpm -r build`. Symlinks keep
working — they point at the rebuilt files.

## Development

```bash
pnpm install
pnpm -r build
pnpm -r test    # end-to-end suites with stub backends; no paid calls
```

Each package under `packages/` is a deliberate copy-paste sibling —
`claude-sub` is the canonical template; keep changes uniform across siblings.
Specs live in `SPEC.md` and `SPEC-*.md`.
