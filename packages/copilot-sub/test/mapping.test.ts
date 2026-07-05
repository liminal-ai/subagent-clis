import { describe, it, expect } from "vitest";
import {
  createStreamState,
  mapRawEvent,
} from "../src/stream-mapper.js";
import { buildEnvelope } from "../src/envelope.js";

describe("canonical stream mapping", () => {
  it("maps observed Copilot JSONL events, tools, usage, and final text", () => {
    const state = createStreamState();
    state.model = "gpt-5.4";
    const rawEvents = [
      { type: "session.tools_updated", data: { model: "gpt-5.5" } },
      { type: "user.message", data: { content: "Run the shell command: echo hi" } },
      { type: "assistant.turn_start", data: { turnId: "0" } },
      {
        type: "assistant.message",
        data: {
          messageId: "msg-tool",
          model: "gpt-5.5",
          content: "",
          toolRequests: [
            {
              toolCallId: "call_echo",
              name: "bash",
              arguments: { command: "echo hi", description: "Run echo hi" },
            },
          ],
        },
      },
      {
        type: "tool.execution_start",
        data: {
          toolCallId: "call_echo",
          toolName: "bash",
          arguments: { command: "echo hi", description: "Run echo hi" },
          model: "gpt-5.5",
        },
      },
      {
        type: "tool.execution_partial_result",
        data: { toolCallId: "call_echo", partialOutput: "hi\n" },
      },
      {
        type: "tool.execution_complete",
        data: {
          toolCallId: "call_echo",
          success: true,
          result: { content: "hi\n<shellId: 0 completed with exit code 0>" },
        },
      },
      {
        type: "assistant.message_delta",
        data: { messageId: "msg-final", deltaContent: "Done" },
        ephemeral: true,
      },
      {
        type: "assistant.message",
        data: {
          messageId: "msg-final",
          model: "gpt-5.5",
          content: "Done! Here is the result.",
          toolRequests: [],
        },
      },
      {
        type: "assistant.reasoning",
        data: { reasoningId: "reasoning-abc", content: "brief reasoning summary" },
      },
      {
        type: "result",
        sessionId: "copilot-session-abc123",
        exitCode: 0,
        usage: {
          premiumRequests: 7.5,
          totalApiDurationMs: 3079,
          sessionDurationMs: 4263,
          codeChanges: { linesAdded: 0, linesRemoved: 0, filesModified: [] },
        },
      },
      { type: "weird_unknown_event", foo: "bar" },
    ];

    const canonical = [];
    for (const raw of rawEvents) {
      const ts = "2026-07-01T12:00:00.000Z";
      canonical.push(...mapRawEvent(raw, ts, state));
    }

    expect(state.sessionId).toBe("copilot-session-abc123");
    expect(state.model).toBe("gpt-5.5");
    expect(state.lastAssistantText).toBe("Done! Here is the result.");
    expect(state.assistantMessages).toEqual(["Done! Here is the result."]);
    expect(state.resultText).toBe("Done! Here is the result.");
    expect(state.usage).toMatchObject({ premiumRequests: 7.5 });

    const types = canonical.map((e) => e.t);
    expect(types).toContain("lifecycle");
    expect(types).toContain("message");
    expect(types).toContain("reasoning");
    expect(types).toContain("tool_call");
    expect(types).toContain("tool_result");
    expect(types).toContain("usage");
    expect(types).toContain("other");

    const lifecycleStart = canonical.find(
      (e) => e.t === "lifecycle" && e.event === "start",
    );
    expect(lifecycleStart).toMatchObject({
      data: { session_id: null, model: "gpt-5.5" },
    });

    const lifecycleEnd = canonical.find(
      (e) => e.t === "lifecycle" && e.event === "end",
    );
    expect(lifecycleEnd).toMatchObject({
      data: {
        session_id: "copilot-session-abc123",
        exit_code: 0,
      },
    });

    const toolCall = canonical.find((e) => e.t === "tool_call");
    expect(toolCall).toMatchObject({
      name: "bash",
      args: { command: "echo hi", description: "Run echo hi" },
      call_id: "call_echo",
    });

    const toolResult = canonical.find((e) => e.t === "tool_result");
    expect(toolResult).toMatchObject({
      name: "bash",
      ok: true,
      output: "hi\n<shellId: 0 completed with exit code 0>",
      call_id: "call_echo",
    });

    const delta = canonical.find(
      (e) => e.t === "other" && e.raw_type === "assistant.message_delta",
    );
    expect(delta).toBeTruthy();
  });

  it("sets envelope status error when Copilot emits an error event even with exit 0", () => {
    const state = createStreamState();
    mapRawEvent(
      {
        type: "assistant.message",
        data: { content: "partial answer", model: "gpt-5.5" },
      },
      "2026-07-01T12:00:00.000Z",
      state,
    );
    mapRawEvent(
      { type: "error", message: "Something went wrong" },
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
    expect(envelope.result).toBe("partial answer");
  });

  it("uses result.exitCode for envelope status and exit_code", () => {
    const state = createStreamState();
    mapRawEvent(
      { type: "result", sessionId: "sess-fail", exitCode: 7, usage: { premiumRequests: 1 } },
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
    expect(envelope.exit_code).toBe(7);
    expect(envelope.usage).toEqual({ premiumRequests: 1 });
  });

  it("maps error data strings when message is absent", () => {
    const state = createStreamState();
    const events = mapRawEvent(
      { type: "error", data: "backend rejected request" },
      "2026-07-01T12:00:00.000Z",
      state,
    );
    const error = events.find((event) => event.t === "error");
    expect(error).toMatchObject({
      t: "error",
      message: "backend rejected request",
    });
  });
});
