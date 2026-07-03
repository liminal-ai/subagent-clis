export function buildClaudeExecArgs(passthrough: string[]): string[] {
  const args = [...passthrough];
  let hasPrint = false;
  let hasOutputFormat = false;
  let hasVerbose = false;
  let hasDangerousSkip = false;
  let hasPermissionMode = false;
  let hasAllowedTools = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "-p" || arg === "--print") {
      hasPrint = true;
    } else if (arg === "--output-format") {
      hasOutputFormat = true;
    } else if (arg.startsWith("--output-format=")) {
      hasOutputFormat = true;
    } else if (arg === "--verbose") {
      hasVerbose = true;
    } else if (arg === "--dangerously-skip-permissions") {
      hasDangerousSkip = true;
    } else if (arg === "--permission-mode") {
      hasPermissionMode = true;
    } else if (arg.startsWith("--permission-mode=")) {
      hasPermissionMode = true;
    } else if (arg === "--allowedTools" || arg === "--allowed-tools") {
      hasAllowedTools = true;
    } else if (arg.startsWith("--allowedTools=") || arg.startsWith("--allowed-tools=")) {
      hasAllowedTools = true;
    }
  }

  const execArgs: string[] = [];
  if (!hasPrint) {
    execArgs.push("-p");
  }
  if (!hasOutputFormat) {
    execArgs.push("--output-format", "stream-json");
  }
  if (!hasVerbose) {
    execArgs.push("--verbose");
  }
  if (!hasDangerousSkip && !hasPermissionMode && !hasAllowedTools) {
    execArgs.push("--dangerously-skip-permissions");
  }
  execArgs.push(...args);
  return execArgs;
}

export function buildClaudeArgv(prompt: string, passthrough: string[]): string[] {
  const execArgs = buildClaudeExecArgs(passthrough);
  return ["claude", ...execArgs, prompt];
}

export function extractModelFromArgs(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--model" || args[i] === "-m") {
      return args[i + 1] ?? null;
    }
    if (args[i]?.startsWith("--model=")) {
      return args[i]!.slice("--model=".length);
    }
  }
  return null;
}
