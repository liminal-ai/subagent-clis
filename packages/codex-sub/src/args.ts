export function validateResumePassthrough(passthrough: string[]): string | null {
  for (let i = 0; i < passthrough.length; i++) {
    const arg = passthrough[i]!;
    if (arg === "--resume") {
      const next = passthrough[i + 1];
      if (next === undefined || next.startsWith("-")) {
        return "--resume requires a session id";
      }
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

export function extractResumeSessionId(passthrough: string[]): {
  passthrough: string[];
  resumeSessionId?: string;
} {
  const result: string[] = [];
  let resumeSessionId: string | undefined;

  for (let i = 0; i < passthrough.length; i++) {
    const arg = passthrough[i]!;
    if (arg === "--resume") {
      resumeSessionId = passthrough[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--resume=")) {
      resumeSessionId = arg.slice("--resume=".length);
      continue;
    }
    result.push(arg);
  }

  return { passthrough: result, resumeSessionId };
}

export function buildCodexExecArgs(passthrough: string[]): string[] {
  const { passthrough: args, resumeSessionId } = extractResumeSessionId(passthrough);
  const hasJson = args.includes("--json");

  if (resumeSessionId) {
    const execArgs: string[] = ["exec", "resume"];
    if (!hasJson) {
      execArgs.push("--json");
    }
    execArgs.push(resumeSessionId, ...args);
    return execArgs;
  }

  const execArgs: string[] = ["exec"];
  if (!hasJson) {
    execArgs.push("--json");
  }
  execArgs.push(...args);
  return execArgs;
}

export function buildCodexArgv(
  prompt: string,
  passthrough: string[],
): string[] {
  const execArgs = buildCodexExecArgs(passthrough);
  return ["codex", ...execArgs, prompt];
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
