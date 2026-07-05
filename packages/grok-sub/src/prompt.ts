import { readFile } from "node:fs/promises";
import process from "node:process";
import { getPromptAndPassthrough } from "./argv.js";

export const PROMPT_STDIN = "-" as const;
export const PROMPT_HANDOFF_FILE = "prompt.txt";
export const PROMPT_ARGV_HANDOFF_THRESHOLD = 32 * 1024;

export const AMBIGUOUS_PROMPT_HINT =
  ". Use exactly one of: inline text, - (stdin), or --prompt-file <path>";

export async function readStdinPrompt(): Promise<string | { error: string }> {
  if (process.stdin.isTTY) {
    return {
      error:
        "prompt '-' expects a piped prompt on stdin, but stdin is a TTY",
    };
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) {
    return {
      error:
        "prompt '-' expects a piped prompt on stdin, but stdin was empty or whitespace-only",
    };
  }

  return text;
}

export async function readPromptFromFile(
  path: string,
): Promise<string | { error: string; path: string }> {
  try {
    const text = await readFile(path, "utf8");
    if (!text.trim()) {
      return {
        error: `prompt file is empty or whitespace-only: ${path}`,
        path,
      };
    }
    return text;
  } catch {
    return { error: `cannot read prompt file: ${path}`, path };
  }
}

export async function resolvePrompt(
  commandName: "exec" | "start",
): Promise<string | { error: string; [key: string]: unknown }> {
  const { prompt: positional, promptFile, passthrough, afterDoubleDash } =
    getPromptAndPassthrough(commandName);

  const hasPositional = positional !== "";
  const isStdin = positional === PROMPT_STDIN;
  const hasInlinePrompt = hasPositional && !isStdin;

  if (hasInlinePrompt && positional.startsWith("-")) {
    return {
      error: `prompt looks like a flag: '${positional}'. Pass inline text, - for stdin, or --prompt-file <path>`,
    };
  }

  if (hasInlinePrompt && passthrough.includes(PROMPT_STDIN) && !afterDoubleDash) {
    return {
      error:
        "ambiguous prompt: provide either a positional prompt or - (stdin), not both" +
        AMBIGUOUS_PROMPT_HINT,
    };
  }

  if (hasInlinePrompt && promptFile) {
    return {
      error:
        "ambiguous prompt: provide either a positional prompt or --prompt-file, not both" +
        AMBIGUOUS_PROMPT_HINT,
    };
  }
  if (isStdin && promptFile) {
    return {
      error:
        "ambiguous prompt: '-' and --prompt-file cannot be used together" +
        AMBIGUOUS_PROMPT_HINT,
    };
  }

  if (promptFile !== undefined) {
    if (promptFile === "") {
      return { error: "--prompt-file requires a path" };
    }
    return await readPromptFromFile(promptFile);
  }

  if (isStdin) {
    return await readStdinPrompt();
  }

  if (!hasPositional) {
    return { error: "prompt is required: pass inline text, - for stdin, or --prompt-file <path>" };
  }

  return positional;
}
