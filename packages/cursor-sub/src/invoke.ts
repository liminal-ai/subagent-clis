import process from "node:process";

function stripGlobalFlags(args: string[]): string[] {
  const rest: string[] = [];
  let i = 0;

  while (i < args.length) {
    const arg = args[i]!;
    if (arg === "--dir") {
      i += 2;
      continue;
    }
    rest.push(arg);
    i += 1;
  }

  return rest;
}

/**
 * True when argv requests the top-level onboarding page (bare invoke or --help).
 */
export function shouldShowOnboarding(argv: string[]): boolean {
  const rest = stripGlobalFlags(argv.slice(2));

  if (rest.length === 0) {
    return true;
  }
  if (rest.length === 1 && (rest[0] === "--help" || rest[0] === "-h")) {
    return true;
  }
  return false;
}

/**
 * True when argv requests --version / -V.
 */
export function shouldPrintVersion(argv: string[]): boolean {
  const rest = stripGlobalFlags(argv.slice(2));
  return rest.some((arg) => arg === "--version" || arg === "-V");
}
