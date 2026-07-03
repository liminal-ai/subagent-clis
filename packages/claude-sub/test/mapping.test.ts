import { describe, it, expect } from "vitest";
import {
  createStreamState,
  mapRawEvent,
} from "../src/stream-mapper.js";
import { buildEnvelope } from "../src/envelope.js";

describe("canonical stream mapping", () => {
  it("maps canned claude events with per-block fan-out and tool correlation", () => {
    const state = createStreamState();
    const rawEvents = [
      {
        type: "system",
        subtype: "init",
        session_id: "claude-session-abc123",
        cwd: "/tmp/test",
        model: "claude-sonnet-4-20250514",
        tools: ["Read"],
        uuid: "uuid-init",
      },
      {
        type: "system",
        subtype: "thinking_tokens",
        thinking_tokens: 42,
        session_id: "claude-session-abc123",
        uuid: "uuid-thinking-tokens",
      },
      {
        type: "rate_limit_event",
        status: "ok",
        session_id: "claude-session-abc123",
        uuid: "uuid-rate-limit",
      },
      {
        type: "assistant",
        message: {
          model: "claude-sonnet-4-20250514",
          content: [
            { type: "thinking", thinking: "I should read the file first." },
            { type: "text", text: "Working on it..." },
            {
              type: "tool_use",
              id: "toolu_123",
              name: "Read",
              input: { file_path: "/tmp/foo.txt" },
            },
          ],
        },
        session_id: "claude-session-abc123",
        uuid: "uuid-assistant",
      },
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_123",
              content: "file contents here",
              is_error: false,
            },
          ],
        },
        session_id: "claude-session-abc123",
        uuid: "uuid-user",
      },
      {
        type: "assistant",
        message: {
          model: "claude-sonnet-4-20250514",
          content: [{ type: "text", text: "Done! Here is the result." }],
        },
        session_id: "claude-session-abc123",
        uuid: "uuid-assistant2",
      },
      {
        type: "result",
        subtype: "success",
        is_error: false,
        result: "Done! Here is the result.",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 20,
        },
        total_cost_usd: 0.0042,
        duration_ms: 5000,
        session_id: "claude-session-abc123",
        uuid: "uuid-result",
      },
      { type: "weird_unknown_event", foo: "bar" },
    ];

    const canonical = [];
    for (const raw of rawEvents) {
      const ts = "2026-07-01T12:00:00.000Z";
      canonical.push(...mapRawEvent(raw, ts, state));
    }

    expect(state.sessionId).toBe("claude-session-abc123");
    expect(state.model).toBe("claude-sonnet-4-20250514");
    expect(state.lastAssistantText).toBe("Done! Here is the result.");
    expect(state.assistantMessages).toEqual([
      "Working on it...",
      "Done! Here is the result.",
    ]);
    expect(state.resultText).toBe("Done! Here is the result.");
    expect(state.usage).toEqual({
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 20,
      total_cost_usd: 0.0042,
    });

    const types = canonical.map((e) => e.t);
    expect(types).toContain("lifecycle");
    expect(types).toContain("message");
    expect(types).toContain("reasoning");
    expect(types).toContain("tool_call");
    expect(types).toContain("tool_result");
    expect(types).toContain("usage");
    expect(types).toContain("other");

    const firstAssistantEvents = mapRawEvent(
      rawEvents[3]!,
      "2026-07-01T12:00:00.000Z",
      createStreamState(),
    );
    expect(firstAssistantEvents.map((e) => e.t)).toEqual([
      "reasoning",
      "message",
      "tool_call",
    ]);

    const lifecycle = canonical.find(
      (e) => e.t === "lifecycle" && e.event === "start",
    );
    expect(lifecycle).toMatchObject({
      data: { session_id: "claude-session-abc123" },
    });

    const toolCall = canonical.find((e) => e.t === "tool_call");
    expect(toolCall).toMatchObject({
      name: "Read",
      args: { file_path: "/tmp/foo.txt" },
      call_id: "toolu_123",
    });

    const toolResult = canonical.find((e) => e.t === "tool_result");
    expect(toolResult).toMatchObject({
      name: "Read",
      ok: true,
      output: "file contents here",
    });

    const thinkingTokens = canonical.find(
      (e) => e.t === "other" && e.raw_type === "system/thinking_tokens",
    );
    expect(thinkingTokens).toBeTruthy();

    const rateLimit = canonical.find(
      (e) => e.t === "other" && e.raw_type === "rate_limit_event",
    );
    expect(rateLimit).toBeTruthy();

    const other = canonical.find(
      (e) => e.t === "other" && e.raw_type === "weird_unknown_event",
    );
    expect(other).toMatchObject({
      raw_type: "weird_unknown_event",
    });
  });

  it("sets envelope status error when result is_error is true even with exit 0", () => {
    const state = createStreamState();
    mapRawEvent(
      {
        type: "result",
        subtype: "error",
        is_error: true,
        result: "Something went wrong",
        usage: { input_tokens: 1, output_tokens: 1 },
        total_cost_usd: 0.01,
        session_id: "sess-err",
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
    expect(envelope.result).toBe("Something went wrong");
    expect(envelope.usage?.total_cost_usd).toBe(0.01);
  });
});
