import { describe, it, expect } from "vitest";
import {
  createStreamState,
  mapRawEvent,
} from "../src/stream-mapper.js";
import { buildEnvelope } from "../src/envelope.js";

describe("canonical stream mapping", () => {
  it("maps canned codex events", () => {
    const state = createStreamState();
    const rawEvents = [
      { type: "thread.started", thread_id: "codex-thread-abc123" },
      { type: "turn.started" },
      {
        type: "item.completed",
        item: { type: "agent_message", text: "Working on it..." },
      },
      {
        type: "item.completed",
        item: { type: "reasoning", text: "planning" },
      },
      {
        type: "item.started",
        item: { type: "command_execution", command: "echo hello" },
      },
      {
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "echo hello",
          exit_code: 0,
          aggregated_output: "hello\n",
        },
      },
      {
        type: "item.completed",
        item: { type: "agent_message", text: "Done! Here is the result." },
      },
      {
        type: "turn.completed",
        usage: {
          input_tokens: 100,
          cached_input_tokens: 20,
          output_tokens: 50,
        },
      },
      { type: "weird_unknown_event", foo: "bar" },
    ];

    const canonical = [];
    for (const raw of rawEvents) {
      const ts = "2026-07-01T12:00:00.000Z";
      canonical.push(...mapRawEvent(raw, ts, state));
    }

    expect(state.sessionId).toBe("codex-thread-abc123");
    expect(state.model).toBeNull();
    expect(state.lastAssistantText).toBe("Done! Here is the result.");
    expect(state.assistantMessages).toEqual([
      "Working on it...",
      "Done! Here is the result.",
    ]);
    expect(state.usage).toEqual({
      input_tokens: 100,
      cached_input_tokens: 20,
      output_tokens: 50,
    });

    const types = canonical.map((e) => e.t);
    expect(types).toContain("lifecycle");
    expect(types).toContain("message");
    expect(types).toContain("reasoning");
    expect(types).toContain("tool_call");
    expect(types).toContain("tool_result");
    expect(types).toContain("usage");
    expect(types).toContain("other");

    const lifecycle = canonical.find(
      (e) => e.t === "lifecycle" && e.event === "start",
    );
    expect(lifecycle).toMatchObject({
      data: { thread_id: "codex-thread-abc123" },
    });

    const toolCall = canonical.find((e) => e.t === "tool_call");
    expect(toolCall).toMatchObject({
      name: "shell",
      args: { command: "echo hello" },
    });

    const toolResult = canonical.find((e) => e.t === "tool_result");
    expect(toolResult).toMatchObject({
      name: "shell",
      ok: true,
      output: "hello\n",
    });

    const turnStarted = canonical.find(
      (e) => e.t === "other" && e.raw_type === "turn.started",
    );
    expect(turnStarted).toBeTruthy();

    const turnCompleted = canonical.find(
      (e) => e.t === "other" && e.raw_type === "turn.completed",
    );
    expect(turnCompleted).toBeTruthy();

    const other = canonical.find(
      (e) => e.t === "other" && e.raw_type === "weird_unknown_event",
    );
    expect(other).toMatchObject({
      raw_type: "weird_unknown_event",
    });
  });

  it("best-effort: captures model from a synthetic stream event if present", () => {
    const state = createStreamState();
    mapRawEvent(
      { type: "session.created", model: "o3-mini" },
      "2026-07-01T12:00:00.000Z",
      state,
    );
    expect(state.model).toBe("o3-mini");
  });

  it("uses argv model in envelope when stream omits model", () => {
    const state = createStreamState();
    mapRawEvent(
      { type: "thread.started", thread_id: "t-no-model" },
      "2026-07-01T12:00:00.000Z",
      state,
    );
    const envelope = buildEnvelope({
      runId: "run-1",
      cwd: "/tmp",
      startedAt: "2026-07-01T12:00:00.000Z",
      endedAt: "2026-07-01T12:00:01.000Z",
      exitCode: 0,
      state: { ...state, model: state.model ?? "gpt-4.1" },
      streamPath: "/tmp/stream.jsonl",
      rawPath: "/tmp/raw.jsonl",
      stderrPath: "/tmp/stderr.log",
    });
    expect(envelope.model).toBe("gpt-4.1");
  });
});
