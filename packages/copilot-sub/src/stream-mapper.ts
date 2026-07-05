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
  | { t: "error"; message: string; data: Record<string, unknown>; ts: string }
  | { t: "other"; raw_type: string; data: Record<string, unknown>; ts: string };

export interface StreamState {
  sessionId: string | null;
  model: string | null;
  usage: Record<string, unknown> | null;
  lastAssistantText: string;
  assistantMessages: string[];
  resultText: string | null;
  resultExitCode: number | null;
  toolNames: Record<string, string>;
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
    resultExitCode: null,
    toolNames: {},
    isError: false,
    started: false,
  };
}

function rawTypeLabel(type: string | undefined): string {
  return type ?? "unknown";
}

function isMeaningfulStart(type: string | undefined): boolean {
  if (!type) {
    return true;
  }
  return !type.startsWith("session.");
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
  const data = raw.data as Record<string, unknown> | undefined;
  for (const value of [raw.message, raw.error, raw.data, data?.message, data?.error]) {
    if (typeof value === "string") {
      return value;
    }
  }
  return "copilot stream error";
}

function dataObject(raw: Record<string, unknown>): Record<string, unknown> {
  return (raw.data as Record<string, unknown> | undefined) ?? {};
}

function maybeModel(data: Record<string, unknown>, state: StreamState): void {
  if (typeof data.model === "string") {
    state.model = data.model;
  }
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

function stringifyOutput(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  return JSON.stringify(value);
}

function toolResultOutput(data: Record<string, unknown>): string {
  const result = data.result as Record<string, unknown> | undefined;
  if (!result) {
    return "";
  }
  return stringifyOutput(result.content ?? result.detailedContent ?? result);
}

export function mapRawEvent(
  raw: Record<string, unknown>,
  ts: string,
  state: StreamState,
): CanonicalEvent[] {
  const type = raw.type as string | undefined;
  const events: CanonicalEvent[] = [];
  const data = dataObject(raw);
  maybeModel(data, state);

  if (isMeaningfulStart(type)) {
    appendStartEvent(events, ts, state);
  }

  if (type === "assistant.message") {
    const content = typeof data.content === "string" ? data.content : "";
    if (content) {
      state.lastAssistantText = content;
      state.resultText = content;
      state.assistantMessages.push(content);
      events.push({ t: "message", role: "assistant", text: content, ts });
      return events;
    }

    events.push({ t: "other", raw_type: "assistant.message", data: raw, ts });
    return events;
  }

  if (type === "assistant.reasoning") {
    const text = typeof data.content === "string" ? data.content : "";
    if (text) {
      events.push({ t: "reasoning", text, ts });
      return events;
    }
  }

  if (type === "tool.execution_start") {
    const name = typeof data.toolName === "string" ? data.toolName : "unknown";
    const args = (data.arguments as Record<string, unknown> | undefined) ?? {};
    const callId = typeof data.toolCallId === "string" ? data.toolCallId : undefined;
    if (callId) {
      state.toolNames[callId] = name;
    }
    events.push({
      t: "tool_call",
      name,
      args,
      ts,
      ...(callId ? { call_id: callId } : {}),
    });
    return events;
  }

  if (type === "tool.execution_complete") {
    const callId = typeof data.toolCallId === "string" ? data.toolCallId : undefined;
    const name =
      (callId ? state.toolNames[callId] : undefined) ??
      (typeof data.toolName === "string" ? data.toolName : "unknown");
    const output = truncateOutput(toolResultOutput(data));
    events.push({
      t: "tool_result",
      name,
      ok: data.success === true,
      output: output.output,
      ts,
      ...(callId ? { call_id: callId } : {}),
      ...(output.truncated ? { truncated: true } : {}),
    });
    return events;
  }

  if (type === "result") {
    if (typeof raw.sessionId === "string") {
      state.sessionId = raw.sessionId;
    }
    if (typeof raw.exitCode === "number") {
      state.resultExitCode = raw.exitCode;
      if (raw.exitCode !== 0) {
        state.isError = true;
      }
    }
    state.usage = (raw.usage as Record<string, unknown> | undefined) ?? {};
    events.push({ t: "usage", data: state.usage, ts });
    events.push({
      t: "lifecycle",
      event: "end",
      data: {
        session_id: state.sessionId,
        exit_code: state.resultExitCode,
      },
      ts,
    });
    return events;
  }

  if (type === "error" || type?.endsWith(".error")) {
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
