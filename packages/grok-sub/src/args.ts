function grokFlagValueSkip(arg: string): number {
  if (arg.includes("=")) {
    return 0;
  }
  switch (arg) {
    case "--output-format":
    case "-p":
    case "--single":
    case "--permission-mode":
    case "--tools":
    case "--disallowed-tools":
    case "--allow":
    case "--deny":
    case "--model":
    case "-m":
    case "--rules":
    case "--cwd":
    case "--session-id":
    case "-s":
    case "--resume":
    case "-r":
    case "--max-turns":
    case "--effort":
    case "--reasoning-effort":
    case "--sandbox":
    case "--agent":
    case "--agents":
    case "--system-prompt-override":
    case "--best-of-n":
    case "--prompt-json":
    case "--prompt-file":
    case "--debug-file":
    case "--leader-socket":
    case "--compaction-mode":
    case "--compaction-detail":
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
  }
  return null;
}

export function buildGrokExecArgs(prompt: string, passthrough: string[]): string[] {
  const args = [...passthrough];
  let hasOutputFormat = false;
  let hasAlwaysApprove = false;
  let hasPermissionPosture = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--output-format" || arg.startsWith("--output-format=")) {
      hasOutputFormat = true;
    } else if (arg === "--always-approve" || arg === "--yolo") {
      hasAlwaysApprove = true;
    } else if (
      arg === "--permission-mode" ||
      arg.startsWith("--permission-mode=") ||
      arg === "--allow" ||
      arg.startsWith("--allow=") ||
      arg === "--deny" ||
      arg.startsWith("--deny=")
    ) {
      hasPermissionPosture = true;
    }

    const valueSkip = grokFlagValueSkip(arg);
    if (valueSkip > 0) {
      i += valueSkip;
    }
  }

  const execArgs: string[] = prompt.startsWith("-") ? [`-p=${prompt}`] : ["-p", prompt];
  if (!hasOutputFormat) {
    execArgs.push("--output-format", "streaming-json");
  }
  if (!hasAlwaysApprove && !hasPermissionPosture) {
    execArgs.push("--always-approve");
  }
  execArgs.push(...args);
  return execArgs;
}

export function buildGrokArgv(prompt: string, passthrough: string[]): string[] {
  const execArgs = buildGrokExecArgs(prompt, passthrough);
  return ["grok", ...execArgs];
}

export function extractModelFromArgs(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--model" || arg === "-m") {
      return args[i + 1] ?? null;
    }
    if (arg.startsWith("--model=")) {
      return arg.slice("--model=".length);
    }
    const valueSkip = grokFlagValueSkip(arg);
    if (valueSkip > 0) {
      i += valueSkip;
    }
  }
  return null;
}
