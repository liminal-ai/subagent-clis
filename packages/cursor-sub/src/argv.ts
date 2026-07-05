import process from "node:process";

type CommandName = "exec" | "start" | "_runner" | "result" | "list";

function skipDirWidth(arg: string): number {
  if (arg === "--dir") {
    return 2;
  }
  if (arg.startsWith("--dir=")) {
    return 1;
  }
  return 0;
}

export function validateDirFromArgv(argv: string[] = process.argv): string | null {
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") {
      break;
    }
    if (arg === "--dir") {
      const next = argv[i + 1];
      if (next === undefined || next === "--") {
        return "--dir requires a path";
      }
      i += 1;
      continue;
    }
    if (arg.startsWith("--dir=")) {
      if (!arg.slice("--dir=".length)) {
        return "--dir requires a path";
      }
    }
  }
  return null;
}

export function extractDirFromArgv(argv: string[] = process.argv): string | undefined {
  let dir: string | undefined;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") {
      break;
    }
    const skip = skipDirWidth(arg);
    if (skip === 2) {
      const next = argv[i + 1];
      if (next && next !== "--") {
        dir = next;
        i += 1;
      }
      continue;
    }
    if (skip === 1) {
      const value = arg.slice("--dir=".length);
      if (value) {
        dir = value;
      }
    }
  }
  return dir;
}

function skipWidth(arg: string, commandName: CommandName): number {
  const dirSkip = skipDirWidth(arg);
  if (dirSkip > 0) {
    return dirSkip;
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
): { tokens: string[]; afterDoubleDash: boolean } {
  const argv = process.argv.slice(2);
  let i = 0;

  while (i < argv.length) {
    if (argv[i] === "--") {
      break;
    }
    const dirSkip = skipDirWidth(argv[i]!);
    if (dirSkip > 0) {
      i += dirSkip;
      continue;
    }
    break;
  }

  while (i < argv.length && argv[i] !== commandName) {
    if (argv[i] === "--") {
      break;
    }
    const dirSkip = skipDirWidth(argv[i]!);
    if (dirSkip > 0) {
      i += dirSkip;
      continue;
    }
    i += 1;
  }

  if (i >= argv.length) {
    return { tokens: [], afterDoubleDash: false };
  }

  i += 1;

  for (let skipped = 0; skipped < skipInitialPositionals && i < argv.length; skipped++) {
    if (!argv[i]!.startsWith("-")) {
      i += 1;
    }
  }

  const tokens: string[] = [];
  let afterDoubleDash = false;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg === "--") {
      afterDoubleDash = true;
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

  return { tokens, afterDoubleDash };
}

function extractPromptFile(commandName: "exec" | "start"): string | undefined {
  const argv = process.argv.slice(2);
  let i = 0;

  while (i < argv.length) {
    if (argv[i] === "--") {
      break;
    }
    const dirSkip = skipDirWidth(argv[i]!);
    if (dirSkip > 0) {
      i += dirSkip;
      continue;
    }
    break;
  }

  while (i < argv.length && argv[i] !== commandName) {
    if (argv[i] === "--") {
      break;
    }
    const dirSkip = skipDirWidth(argv[i]!);
    if (dirSkip > 0) {
      i += dirSkip;
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
): { prompt: string; promptFile?: string; passthrough: string[]; afterDoubleDash: boolean } {
  const { tokens, afterDoubleDash } = collectTokensAfterCommand(commandName);
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
    afterDoubleDash,
  };
}

export function getRunnerPassthrough(): string[] {
  return collectTokensAfterCommand("_runner", 1).tokens;
}
