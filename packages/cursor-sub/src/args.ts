function cursorFlagValueSkip(arg: string): number {
  if (arg.includes("=")) {
    return 0;
  }
  switch (arg) {
    case "--model":
    case "-m":
    case "--mode":
    case "--sandbox":
    case "--add-dir":
      return 1;
    default:
      return 0;
  }
}

export function buildCursorAgentArgs(passthrough: string[]): string[] {
  const args = [...passthrough];
  let hasModel = false;
  let hasTrust = false;
  let hasForce = false;
  let hasSandbox = false;
  let readonlyMode = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--model" || arg === "-m") {
      hasModel = true;
    } else if (arg.startsWith("--model=")) {
      hasModel = true;
    } else if (arg === "--trust") {
      hasTrust = true;
    } else if (arg === "--force" || arg === "-f" || arg === "--yolo") {
      hasForce = true;
    } else if (arg === "--sandbox" || arg.startsWith("--sandbox=")) {
      hasSandbox = true;
    } else if (arg === "--plan") {
      readonlyMode = true;
    } else if (arg === "--mode") {
      const next = args[i + 1];
      if (next === "plan" || next === "ask") {
        readonlyMode = true;
      }
    } else if (arg === "--mode=plan" || arg === "--mode=ask") {
      readonlyMode = true;
    }

    const valueSkip = cursorFlagValueSkip(arg);
    if (valueSkip > 0) {
      i += valueSkip;
    }
  }

  const execArgs: string[] = [];
  if (!hasModel) {
    execArgs.push("--model", "composer-2.5");
  }
  if (!hasTrust) {
    execArgs.push("--trust");
  }
  if (!hasForce && !readonlyMode) {
    execArgs.push("--force");
  }
  if (!hasSandbox && !readonlyMode) {
    execArgs.push("--sandbox", "disabled");
  }
  execArgs.push(...args);
  return execArgs;
}

export function buildCursorAgentArgv(
  prompt: string,
  passthrough: string[],
): string[] {
  const execArgs = buildCursorAgentArgs(passthrough);
  return [
    "cursor-agent",
    "--print",
    "--output-format",
    "stream-json",
    ...execArgs,
    prompt,
  ];
}
