function copilotFlagValueSkip(arg: string): number {
  if (arg.includes("=")) {
    return 0;
  }
  switch (arg) {
    case "--output-format":
    case "-p":
    case "--prompt":
    case "--model":
    case "--mode":
    case "--add-dir":
    case "--add-github-mcp-tool":
    case "--add-github-mcp-toolset":
    case "--additional-mcp-config":
    case "--agent":
    case "--allow-tool":
    case "--allow-url":
    case "--attachment":
    case "-C":
    case "--connect":
    case "--context":
    case "--deny-tool":
    case "--deny-url":
    case "--disable-mcp-server":
    case "--effort":
    case "--reasoning-effort":
    case "--extension-sdk-path":
    case "-i":
    case "--interactive":
    case "--log-dir":
    case "--log-level":
    case "--max-ai-credits":
    case "--max-autopilot-continues":
    case "-n":
    case "--name":
    case "--plugin-dir":
    case "--session-id":
    case "--share":
    case "--stream":
    case "--available-tools":
    case "--excluded-tools":
    case "--secret-env-vars":
      return 1;
    default:
      return 0;
  }
}

export function validateResumePassthrough(passthrough: string[]): string | null {
  for (let i = 0; i < passthrough.length; i++) {
    const arg = passthrough[i]!;
    if (arg === "--resume" || arg === "-r") {
      const next = passthrough[i + 1];
      if (next === undefined || next.startsWith("-")) {
        return "--resume requires a session id";
      }
      i += 1;
      continue;
    }
    if (arg.startsWith("--resume=")) {
      if (!arg.slice("--resume=".length)) {
        return "--resume requires a session id";
      }
    }
    if (arg.startsWith("-r=")) {
      if (!arg.slice("-r=".length)) {
        return "--resume requires a session id";
      }
    }
  }
  return null;
}

export function buildCopilotExecArgs(prompt: string, passthrough: string[]): string[] {
  const args = [...passthrough];
  let hasOutputFormat = false;
  let hasAllowAllTools = false;
  let hasNoAutoUpdate = false;
  let hasNoAskUser = false;
  let planMode = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--output-format" || arg.startsWith("--output-format=")) {
      hasOutputFormat = true;
    } else if (arg === "--allow-all-tools" || arg === "--allow-all" || arg === "--yolo") {
      hasAllowAllTools = true;
    } else if (arg === "--no-auto-update") {
      hasNoAutoUpdate = true;
    } else if (arg === "--no-ask-user") {
      hasNoAskUser = true;
    } else if (arg === "--plan" || arg === "--mode=plan") {
      planMode = true;
    } else if (arg === "--mode") {
      const next = args[i + 1];
      if (next === "plan") {
        planMode = true;
      }
    }

    const valueSkip = copilotFlagValueSkip(arg);
    if (valueSkip > 0) {
      i += valueSkip;
    }
  }

  const execArgs: string[] = prompt.startsWith("-") ? [`-p=${prompt}`] : ["-p", prompt];
  if (!hasOutputFormat) {
    execArgs.push("--output-format", "json");
  }
  if (!hasAllowAllTools) {
    execArgs.push("--allow-all-tools");
  }
  if (!hasNoAutoUpdate) {
    execArgs.push("--no-auto-update");
  }
  if (!hasNoAskUser) {
    execArgs.push("--no-ask-user");
  }
  if (!planMode) {
    // No broader permission defaults: paths and URLs stay under Copilot's own policy.
  }
  execArgs.push(...args);
  return execArgs;
}

export function buildCopilotArgv(prompt: string, passthrough: string[]): string[] {
  const execArgs = buildCopilotExecArgs(prompt, passthrough);
  return ["copilot", ...execArgs];
}

export function extractModelFromArgs(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--model") {
      return args[i + 1] ?? null;
    }
    if (arg.startsWith("--model=")) {
      return arg.slice("--model=".length);
    }
    const valueSkip = copilotFlagValueSkip(arg);
    if (valueSkip > 0) {
      i += valueSkip;
    }
  }
  return null;
}
