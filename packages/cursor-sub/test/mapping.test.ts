import { describe, it, expect } from "vitest";
import {
  createStreamState,
  mapRawEvent,
} from "../src/stream-mapper.js";
import { buildEnvelope } from "../src/envelope.js";

describe("canonical stream mapping", () => {
  it("maps canned cursor-agent events", () => {
    const state = createStreamState();
    const rawEvents = [
      { type: "system", subtype: "init", model: "composer-2.5" },
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "Working on it..." }] },
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "thinking", text: "planning" }],
        },
      },
      {
        type: "tool_call",
        subtype: "started",
        call_id: "call-1",
        tool_call: {
          readToolCall: { args: { path: "/tmp/example.txt" } },
        },
      },
      {
        type: "tool_call",
        subtype: "completed",
        call_id: "call-1",
        tool_call: {
          readToolCall: {
            result: { success: { content: "hello from file" } },
          },
        },
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Done! Here is the result." }],
        },
      },
      {
        type: "result",
        session_id: "cursor-session-abc123",
        usage: { input_tokens: 100, output_tokens: 50 },
      },
      { type: "weird_unknown_event", foo: "bar" },
    ];

    const canonical = [];
    for (const raw of rawEvents) {
      const ts = "2026-07-01T12:00:00.000Z";
      canonical.push(...mapRawEvent(raw, ts, state));
    }

    expect(state.sessionId).toBe("cursor-session-abc123");
    expect(state.model).toBe("composer-2.5");
    expect(state.lastAssistantText).toBe("Done! Here is the result.");
    expect(state.assistantMessages).toEqual([
      "Working on it...",
      "Done! Here is the result.",
    ]);

    const types = canonical.map((e) => e.t);
    expect(types).toContain("lifecycle");
    expect(types).toContain("message");
    expect(types).toContain("reasoning");
    expect(types).toContain("tool_call");
    expect(types).toContain("tool_result");
    expect(types).toContain("usage");
    expect(types).toContain("other");

    const toolCall = canonical.find((e) => e.t === "tool_call");
    expect(toolCall).toMatchObject({
      name: "Read",
      args: { path: "/tmp/example.txt" },
    });

    const toolResult = canonical.find((e) => e.t === "tool_result");
    expect(toolResult).toMatchObject({
      name: "Read",
      ok: true,
      output: "hello from file",
    });

    const other = canonical.find((e) => e.t === "other");
    expect(other).toMatchObject({
      raw_type: "weird_unknown_event",
    });
  });

  it("sets envelope status error when result is_error is true even with exit 0", () => {
    const state = createStreamState();
    mapRawEvent(
      {
        type: "result",
        session_id: "cursor-session-err",
        is_error: true,
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      "2026-07-01T12:00:00.000Z",
      state,
    );

    const envelope = buildEnvelope({
      runId: "run-1",
      cwd: "/tmp",
      startedAt: "2026-07-01T12:00:00.000Z",
      endedAt: "2026-07-01T12:00:01.000Z",
      exitCode: 0,
      state,
      streamPath: "/tmp/stream.jsonl",
      rawPath: "/tmp/raw.jsonl",
      stderrPath: "/tmp/stderr.log",
    });

    expect(envelope.status).toBe("error");
    expect(envelope.exit_code).toBe(0);
  });
});
