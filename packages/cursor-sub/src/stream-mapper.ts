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

function toolNameFromKey(key: string): string {
  switch (key) {
    case "readToolCall":
      return "Read";
    case "shellToolCall":
      return "Bash";
    case "editToolCall":
      return "Edit";
    case "deleteToolCall":
      return "Delete";
    case "globToolCall":
      return "Glob";
    case "grepToolCall":
      return "Grep";
    default:
      return key.replace(/ToolCall$/, "");
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

function extractToolArgs(
  key: string,
  value: Record<string, unknown>,
): Record<string, unknown> {
  const args = (value.args ?? {}) as Record<string, unknown>;
  if (key === "shellToolCall") {
    return {
      command: args.command,
      description: args.description ?? null,
      workingDirectory: args.workingDirectory ?? null,
    };
  }
  return args;
}

function extractToolOutput(
  key: string,
  value: Record<string, unknown>,
): { ok: boolean; output: string } {
  const result = value.result as Record<string, unknown> | undefined;
  if (!result) {
    return { ok: false, output: "" };
  }

  if (key === "shellToolCall") {
    const success = result.success as Record<string, unknown> | undefined;
    if (success) {
      const out =
        (success.interleavedOutput as string | undefined) ??
        (success.stdout as string | undefined) ??
        "";
      return { ok: true, output: out };
    }
    const rejected = result.rejected as Record<string, unknown> | undefined;
    if (rejected) {
      return {
        ok: false,
        output: String(rejected.reason ?? "rejected"),
      };
    }
  }

  const success = result.success as Record<string, unknown> | undefined;
  if (success) {
    if (typeof success.content === "string") {
      return { ok: true, output: success.content };
    }
    return { ok: true, output: JSON.stringify(success) };
  }

  return { ok: false, output: JSON.stringify(result) };
}

function trimAssistantText(text: string): string {
  return text.replace(/^[\r\n]+/, "").replace(/[\r\n]+$/, "");
}

export function mapRawEvent(
  raw: Record<string, unknown>,
  ts: string,
  state: StreamState,
): CanonicalEvent[] {
  const type = raw.type as string | undefined;
  const events: CanonicalEvent[] = [];

  if (type === "system" && raw.subtype === "init") {
    state.model = (raw.model as string | undefined) ?? state.model;
    events.push({
      t: "lifecycle",
      event: "start",
      data: { model: state.model, subtype: raw.subtype },
      ts,
    });
    return events;
  }

  if (type === "assistant") {
    const message = raw.message as { content?: Array<Record<string, unknown>> } | undefined;
    for (const part of message?.content ?? []) {
      if (part.type === "text" && typeof part.text === "string") {
        const text = trimAssistantText(part.text);
        state.lastAssistantText = text;
        state.assistantMessages.push(text);
        events.push({ t: "message", role: "assistant", text, ts });
      } else if (part.type === "thinking") {
        const text = String(part.text ?? part.thinking ?? "");
        events.push({ t: "reasoning", text, ts });
      }
    }
    return events;
  }

  if (type === "tool_call") {
    const subtype = raw.subtype as string | undefined;
    const toolCall = raw.tool_call as Record<string, Record<string, unknown>> | undefined;
    const callId = raw.call_id as string | undefined;
    if (!toolCall) {
      events.push({ t: "other", raw_type: "tool_call", data: raw, ts });
      return events;
    }

    const [key, value] = Object.entries(toolCall)[0] ?? [];
    if (!key || !value) {
      events.push({ t: "other", raw_type: "tool_call", data: raw, ts });
      return events;
    }

    const name = toolNameFromKey(key);

    if (subtype === "started") {
      events.push({
        t: "tool_call",
        name,
        args: extractToolArgs(key, value),
        ts,
        call_id: callId,
      });
      return events;
    }

    if (subtype === "completed") {
      const { ok, output } = extractToolOutput(key, value);
      const truncated = truncateOutput(output);
      events.push({
        t: "tool_result",
        name,
        ok,
        output: truncated.output,
        ts,
        call_id: callId,
        ...(truncated.truncated ? { truncated: true } : {}),
      });
      return events;
    }

    events.push({ t: "other", raw_type: `tool_call:${subtype ?? "unknown"}`, data: raw, ts });
    return events;
  }

  if (type === "result") {
    state.sessionId = (raw.session_id as string | undefined) ?? state.sessionId;
    const usage = (raw.usage as Record<string, unknown> | undefined) ?? {};
    state.usage = usage;
    events.push({ t: "usage", data: usage, ts });
    events.push({
      t: "lifecycle",
      event: "end",
      data: {
        session_id: state.sessionId,
        is_error: raw.is_error ?? false,
      },
      ts,
    });
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
