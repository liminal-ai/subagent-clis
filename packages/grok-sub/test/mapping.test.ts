import { describe, it, expect } from "vitest";
import {
  createStreamState,
  mapRawEvent,
} from "../src/stream-mapper.js";
import { buildEnvelope } from "../src/envelope.js";

describe("canonical stream mapping", () => {
  it("maps real grok streaming-json events and accumulates text deltas", () => {
    const state = createStreamState();
    state.model = "grok-build";
    const rawEvents = [
      { type: "thought", data: "I should answer directly." },
      { type: "text", data: "Done! " },
      { type: "text", data: "Here is the result." },
      { type: "auto_compact_started", reason: "threshold" },
      {
        type: "end",
        stopReason: "EndTurn",
        sessionId: "grok-session-abc123",
        requestId: "req-abc123",
      },
      { type: "weird_unknown_event", foo: "bar" },
    ];

    const canonical = [];
    for (const raw of rawEvents) {
      const ts = "2026-07-01T12:00:00.000Z";
      canonical.push(...mapRawEvent(raw, ts, state));
    }

    expect(state.sessionId).toBe("grok-session-abc123");
    expect(state.model).toBe("grok-build");
    expect(state.lastAssistantText).toBe("Done! Here is the result.");
    expect(state.assistantMessages).toEqual(["Done! ", "Here is the result."]);
    expect(state.resultText).toBe("Done! Here is the result.");
    expect(state.usage).toBeNull();

    const types = canonical.map((e) => e.t);
    expect(types).toContain("lifecycle");
    expect(types).toContain("message");
    expect(types).toContain("reasoning");
    expect(types).toContain("other");
    expect(types).not.toContain("usage");

    const lifecycleStart = canonical.find(
      (e) => e.t === "lifecycle" && e.event === "start",
    );
    expect(lifecycleStart).toMatchObject({
      data: { session_id: null, model: "grok-build" },
    });

    const lifecycleEnd = canonical.find(
      (e) => e.t === "lifecycle" && e.event === "end",
    );
    expect(lifecycleEnd).toMatchObject({
      data: {
        stop_reason: "EndTurn",
        session_id: "grok-session-abc123",
        request_id: "req-abc123",
      },
    });

    const autoCompact = canonical.find(
      (e) => e.t === "other" && e.raw_type === "auto_compact_started",
    );
    expect(autoCompact).toBeTruthy();

    const other = canonical.find(
      (e) => e.t === "other" && e.raw_type === "weird_unknown_event",
    );
    expect(other).toMatchObject({
      raw_type: "weird_unknown_event",
    });
  });

  it("sets envelope status error when grok emits an error event even with exit 0", () => {
    const state = createStreamState();
    mapRawEvent(
      { type: "text", data: "partial answer" },
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
    expect(envelope.usage).toBeNull();
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
