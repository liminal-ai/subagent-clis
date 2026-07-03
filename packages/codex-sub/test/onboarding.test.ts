import { describe, it, expect } from "vitest";
import { runCli } from "./helpers.js";

const SECTION_HEADERS = [
  "WHAT THIS DOES",
  "COMMANDS",
  "SESSION DIRECTORY",
  "ENVELOPE FIELDS",
  "EXECUTION PROFILE",
  "EXIT CODES",
  "SAFETY",
  "EXAMPLES",
];

const DOCS_FOOTER = "Full envelope and exit-code contract: docs schema";

describe("onboarding", () => {
  it("bare invocation exits 0 and prints section headers", async () => {
    const { code, stdout } = await runCli([], {});
    expect(code).toBe(0);
    for (const header of SECTION_HEADERS) {
      expect(stdout).toContain(header);
    }
    expect(stdout).toContain("codex-subagent");
    expect(stdout).toContain("danger-full-access");
    expect(stdout).toContain("--skip-git-repo-check");
    expect(stdout).not.toMatch(/\x1b\[/);
  });

  it("--help prints the onboarding page", async () => {
    const { code, stdout } = await runCli(["--help"], {});
    expect(code).toBe(0);
    expect(stdout).toContain("WHAT THIS DOES");
    expect(stdout).toContain("SAFETY");
    expect(stdout).toContain("EXAMPLES");
    expect(stdout).toContain(DOCS_FOOTER);
  });

  it("--version prints version and exits 0", async () => {
    const { code, stdout } = await runCli(["--version"], {});
    expect(code).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("docs", () => {
  it("lists topics when called with no topic", async () => {
    const { code, stdout } = await runCli(["docs"], {});
    expect(code).toBe(0);
    expect(stdout).toContain("schema");
    expect(stdout).toContain("events");
    expect(stdout).toContain("examples");
    expect(stdout).toContain("Session directory layout");
    expect(stdout.length).toBeGreaterThan(50);
  });

  it("prints non-empty schema topic", async () => {
    const { code, stdout } = await runCli(["docs", "schema"], {});
    expect(code).toBe(0);
    expect(stdout).toContain("ENVELOPE");
    expect(stdout).toContain("EXIT CODES");
    expect(stdout).toContain("model note:");
    expect(stdout.length).toBeGreaterThan(200);
  });

  it("prints non-empty events topic", async () => {
    const { code, stdout } = await runCli(["docs", "events"], {});
    expect(code).toBe(0);
    expect(stdout).toContain("tool_call");
    expect(stdout).toContain("thread.started");
    expect(stdout.length).toBeGreaterThan(200);
  });

  it("prints non-empty examples topic", async () => {
    const { code, stdout } = await runCli(["docs", "examples"], {});
    expect(code).toBe(0);
    expect(stdout).toContain("PARALLEL RUNS");
    expect(stdout).toContain("--resume");
    expect(stdout).toContain("jq -c 'select(.t==\"tool_call\") | {name, args}'");
    expect(stdout.length).toBeGreaterThan(200);
  });
});
