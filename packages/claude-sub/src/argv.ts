import process from "node:process";

type CommandName = "exec" | "start" | "_runner" | "result" | "list";

function skipWidth(arg: string, commandName: CommandName): number {
  if (arg === "--dir") {
    return 2;
  }
  if (commandName === "exec" && arg === "--text") {
    return 1;
  }
  if (
    (commandName === "exec" || commandName === "start") &&
    (arg === "--prompt-file" || arg.startsWith("--prompt-file="))
  ) {
    return arg.startsWith("--prompt-file=") ? 1 : 2;
  }
  if (commandName === "result" && arg === "--wait") {
    return 1;
  }
  if (commandName === "result" && arg === "--timeout") {
    return 2;
  }
  if (commandName === "list" && (arg === "-n" || arg === "--limit")) {
    return 2;
  }
  if (commandName === "_runner") {
    if (
      arg === "--prompt" ||
      arg === "--prompt-file" ||
      arg.startsWith("--prompt-file=") ||
      arg === "--run-id" ||
      arg === "--cwd"
    ) {
      return arg.startsWith("--prompt-file=") ? 1 : 2;
    }
  }
  if (arg === "-h" || arg === "--help") {
    return 1;
  }
  return 0;
}

function collectTokensAfterCommand(
  commandName: CommandName,
  skipInitialPositionals = 0,
): string[] {
  const argv = process.argv.slice(2);
  let i = 0;

  while (i < argv.length) {
    if (argv[i] === "--dir") {
      i += 2;
      continue;
    }
    break;
  }

  while (i < argv.length && argv[i] !== commandName) {
    if (argv[i] === "--dir") {
      i += 2;
      continue;
    }
    i += 1;
  }

  if (i >= argv.length) {
    return [];
  }

  i += 1;

  for (let skipped = 0; skipped < skipInitialPositionals && i < argv.length; skipped++) {
    if (!argv[i]!.startsWith("-")) {
      i += 1;
    }
  }

  const tokens: string[] = [];
  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg === "--") {
      tokens.push(...argv.slice(i + 1));
      break;
    }

    const skip = skipWidth(arg, commandName);
    if (skip > 0) {
      i += skip;
      continue;
    }

    tokens.push(arg);
    i += 1;
  }

  return tokens;
}

function extractPromptFile(commandName: "exec" | "start"): string | undefined {
  const argv = process.argv.slice(2);
  let i = 0;

  while (i < argv.length) {
    if (argv[i] === "--dir") {
      i += 2;
      continue;
    }
    break;
  }

  while (i < argv.length && argv[i] !== commandName) {
    if (argv[i] === "--dir") {
      i += 2;
      continue;
    }
    i += 1;
  }

  if (i >= argv.length) {
    return undefined;
  }

  i += 1;

  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg === "--") {
      break;
    }
    if (arg === "--prompt-file") {
      return argv[i + 1];
    }
    if (arg.startsWith("--prompt-file=")) {
      return arg.slice("--prompt-file=".length);
    }
    i += 1;
  }

  return undefined;
}

export function getPromptAndPassthrough(
  commandName: "exec" | "start",
): { prompt: string; promptFile?: string; passthrough: string[] } {
  const tokens = collectTokensAfterCommand(commandName);
  const promptFile = extractPromptFile(commandName);
  let prompt = tokens[0] ?? "";
  let passthrough = tokens.slice(1);

  if (
    promptFile !== undefined &&
    prompt !== "-" &&
    (prompt === "" || prompt.startsWith("-"))
  ) {
    passthrough = tokens;
    prompt = "";
  }

  return {
    prompt,
    promptFile,
    passthrough,
  };
}

export function getRunnerPassthrough(): string[] {
  return collectTokensAfterCommand("_runner", 1);
}
