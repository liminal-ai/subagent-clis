const TOOL_OUTPUT_LIMIT = 10 * 1024;

export type CanonicalEvent =
  | { t: "message"; role: "assistant"; text: string; ts: string }
  | { t: "reasoning"; text: string; ts: string }
  | { t: "tool_call"; name: string; args: Record<string, unknown>; ts: string; call_id?: string }
  | {
      t: "tool_result";
      name: string;
      ok: boolean;
      output: string;
      ts: string;
      call_id?: string;
      truncated?: boolean;
    }
  | { t: "usage"; data: Record<string, unknown>; ts: string }
  | { t: "lifecycle"; event: "start" | "end"; data: Record<string, unknown>; ts: string }
  | { t: "other"; raw_type: string; data: Record<string, unknown>; ts: string };

export interface StreamState {
  sessionId: string | null;
  model: string | null;
  usage: Record<string, unknown> | null;
  lastAssistantText: string;
  assistantMessages: string[];
}

export function createStreamState(): StreamState {
  return {
    sessionId: null,
    model: null,
    usage: null,
    lastAssistantText: "",
    assistantMessages: [],
  };
}

function truncateOutput(text: string): { output: string; truncated: boolean } {
  if (text.length <= TOOL_OUTPUT_LIMIT) {
    return { output: text, truncated: false };
  }
  return {
    output: text.slice(0, TOOL_OUTPUT_LIMIT) + "\n...[truncated at 10KB]",
    truncated: true,
  };
}

function trimAssistantText(text: string): string {
  return text.replace(/^[\r\n]+/, "").replace(/[\r\n]+$/, "");
}

function itemRecord(raw: Record<string, unknown>): Record<string, unknown> | undefined {
  return raw.item as Record<string, unknown> | undefined;
}

function captureStreamModel(raw: Record<string, unknown>, state: StreamState): void {
  const topLevel = raw.model;
  if (typeof topLevel === "string" && topLevel) {
    state.model = topLevel;
    return;
  }
  for (const key of ["config", "configuration"] as const) {
    const nested = raw[key] as Record<string, unknown> | undefined;
    if (nested && typeof nested.model === "string" && nested.model) {
      state.model = nested.model;
      return;
    }
  }
}

export function mapRawEvent(
  raw: Record<string, unknown>,
  ts: string,
  state: StreamState,
): CanonicalEvent[] {
  const type = raw.type as string | undefined;
  const events: CanonicalEvent[] = [];

  if (type === "session.created") {
    captureStreamModel(raw, state);
    events.push({ t: "other", raw_type: "session.created", data: raw, ts });
    return events;
  }

  if (type === "thread.started") {
    const threadId = raw.thread_id as string | undefined;
    if (threadId) {
      state.sessionId = threadId;
    }
    captureStreamModel(raw, state);
    events.push({
      t: "lifecycle",
      event: "start",
      data: { thread_id: threadId ?? null },
      ts,
    });
    return events;
  }

  if (type === "turn.started") {
    events.push({ t: "other", raw_type: "turn.started", data: raw, ts });
    return events;
  }

  if (type === "turn.completed") {
    const usage = raw.usage as Record<string, unknown> | undefined;
    if (usage) {
      state.usage = usage;
      events.push({ t: "usage", data: usage, ts });
    }
    events.push({ t: "other", raw_type: "turn.completed", data: raw, ts });
    return events;
  }

  if (type === "item.started") {
    const item = itemRecord(raw);
    if (item?.type === "command_execution") {
      events.push({
        t: "tool_call",
        name: "shell",
        args: { command: item.command },
        ts,
      });
      return events;
    }
    events.push({ t: "other", raw_type: type, data: raw, ts });
    return events;
  }

  if (type === "item.completed") {
    const item = itemRecord(raw);
    if (!item) {
      events.push({ t: "other", raw_type: type, data: raw, ts });
      return events;
    }

    if (item.type === "agent_message" && typeof item.text === "string") {
      const text = trimAssistantText(item.text);
      state.lastAssistantText = text;
      state.assistantMessages.push(text);
      events.push({ t: "message", role: "assistant", text, ts });
      return events;
    }

    if (item.type === "reasoning" && typeof item.text === "string") {
      events.push({ t: "reasoning", text: item.text, ts });
      return events;
    }

    if (item.type === "command_execution") {
      const exitCode = item.exit_code as number | undefined;
      const ok = exitCode === 0;
      const outputText = String(item.aggregated_output ?? "");
      const truncated = truncateOutput(outputText);
      events.push({
        t: "tool_result",
        name: "shell",
        ok,
        output: truncated.output,
        ts,
        ...(truncated.truncated ? { truncated: true } : {}),
      });
      return events;
    }

    events.push({ t: "other", raw_type: type, data: raw, ts });
    return events;
  }

  events.push({
    t: "other",
    raw_type: type ?? "unknown",
    data: raw,
    ts,
  });
  return events;
}

export function sanitizeJsonLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }
  return trimmed;
}
