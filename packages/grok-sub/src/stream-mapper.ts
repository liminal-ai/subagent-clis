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
  | { t: "error"; message: string; data: Record<string, unknown>; ts: string }
  | { t: "other"; raw_type: string; data: Record<string, unknown>; ts: string };

export interface StreamState {
  sessionId: string | null;
  model: string | null;
  usage: Record<string, unknown> | null;
  lastAssistantText: string;
  assistantMessages: string[];
  resultText: string | null;
  isError: boolean;
  started: boolean;
}

export function createStreamState(): StreamState {
  return {
    sessionId: null,
    model: null,
    usage: null,
    lastAssistantText: "",
    assistantMessages: [],
    resultText: null,
    isError: false,
    started: false,
  };
}

function rawTypeLabel(type: string | undefined): string {
  return type ?? "unknown";
}

function appendStartEvent(events: CanonicalEvent[], ts: string, state: StreamState): void {
  if (state.started) {
    return;
  }
  state.started = true;
  events.push({
    t: "lifecycle",
    event: "start",
    data: { session_id: state.sessionId, model: state.model },
    ts,
  });
}

function errorMessage(raw: Record<string, unknown>): string {
  for (const key of ["message", "error", "data"] as const) {
    if (typeof raw[key] === "string") {
      return raw[key];
    }
  }
  return "grok stream error";
}

export function mapRawEvent(
  raw: Record<string, unknown>,
  ts: string,
  state: StreamState,
): CanonicalEvent[] {
  const type = raw.type as string | undefined;
  const events: CanonicalEvent[] = [];
  appendStartEvent(events, ts, state);

  if (type === "text") {
    const text = typeof raw.data === "string" ? raw.data : "";
    state.lastAssistantText += text;
    state.resultText = state.lastAssistantText;
    if (text) {
      state.assistantMessages.push(text);
    }
    events.push({ t: "message", role: "assistant", text, ts });
    return events;
  }

  if (type === "thought") {
    const text = typeof raw.data === "string" ? raw.data : "";
    events.push({ t: "reasoning", text, ts });
    return events;
  }

  if (type === "end") {
    const sessionId = raw.sessionId as string | undefined;
    if (sessionId) {
      state.sessionId = sessionId;
    }
    events.push({
      t: "lifecycle",
      event: "end",
      data: {
        stop_reason: raw.stopReason ?? null,
        session_id: state.sessionId,
        request_id: raw.requestId ?? null,
      },
      ts,
    });
    return events;
  }

  if (type === "error") {
    state.isError = true;
    events.push({
      t: "error",
      message: errorMessage(raw),
      data: raw,
      ts,
    });
    return events;
  }

  events.push({
    t: "other",
    raw_type: rawTypeLabel(type),
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
