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
  resultText: string | null;
  isError: boolean;
  toolUseIdToName: Map<string, string>;
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
    toolUseIdToName: new Map(),
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

function flattenToolResultContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (typeof block === "string") {
        parts.push(block);
      } else if (block && typeof block === "object") {
        const record = block as Record<string, unknown>;
        if (typeof record.text === "string") {
          parts.push(record.text);
        } else {
          parts.push(JSON.stringify(record));
        }
      }
    }
    return parts.join("\n");
  }
  if (content === null || content === undefined) {
    return "";
  }
  return String(content);
}

function rawTypeLabel(type: string | undefined, subtype: string | undefined): string {
  if (type && subtype) {
    return `${type}/${subtype}`;
  }
  return type ?? "unknown";
}

export function mapRawEvent(
  raw: Record<string, unknown>,
  ts: string,
  state: StreamState,
): CanonicalEvent[] {
  const type = raw.type as string | undefined;
  const subtype = raw.subtype as string | undefined;
  const events: CanonicalEvent[] = [];

  if (type === "system" && subtype === "init") {
    const sessionId = raw.session_id as string | undefined;
    if (sessionId) {
      state.sessionId = sessionId;
    }
    const model = raw.model as string | undefined;
    events.push({
      t: "lifecycle",
      event: "start",
      data: { session_id: sessionId ?? null, model: model ?? null },
      ts,
    });
    return events;
  }

  if (type === "assistant") {
    const message = raw.message as
      | { model?: string; content?: Array<Record<string, unknown>> }
      | undefined;
    if (message?.model) {
      state.model = message.model;
    }
    for (const block of message?.content ?? []) {
      if (block.type === "text" && typeof block.text === "string") {
        const text = trimAssistantText(block.text);
        state.lastAssistantText = text;
        state.assistantMessages.push(text);
        events.push({ t: "message", role: "assistant", text, ts });
      } else if (block.type === "thinking" && typeof block.thinking === "string") {
        events.push({ t: "reasoning", text: block.thinking, ts });
      } else if (block.type === "tool_use") {
        const id = block.id as string | undefined;
        const name = block.name as string | undefined;
        const input = (block.input as Record<string, unknown> | undefined) ?? {};
        if (id && name) {
          state.toolUseIdToName.set(id, name);
        }
        events.push({
          t: "tool_call",
          name: name ?? "unknown",
          args: input,
          ts,
          ...(id ? { call_id: id } : {}),
        });
      } else {
        events.push({
          t: "other",
          raw_type: `assistant/${(block.type as string | undefined) ?? "unknown"}`,
          data: block,
          ts,
        });
      }
    }
    if (events.length === 0) {
      events.push({
        t: "other",
        raw_type: rawTypeLabel(type, subtype),
        data: raw,
        ts,
      });
    }
    return events;
  }

  if (type === "user") {
    const message = raw.message as { content?: unknown } | undefined;
    const content = message?.content;
    if (typeof content === "string") {
      events.push({
        t: "other",
        raw_type: "user/string_content",
        data: raw,
        ts,
      });
      return events;
    }
    for (const block of (content as Array<Record<string, unknown>> | undefined) ?? []) {
      if (block.type === "tool_result") {
        const toolUseId = block.tool_use_id as string | undefined;
        const name = (toolUseId && state.toolUseIdToName.get(toolUseId)) || "unknown";
        const isError = block.is_error === true;
        const outputText = flattenToolResultContent(block.content);
        const truncated = truncateOutput(outputText);
        events.push({
          t: "tool_result",
          name,
          ok: !isError,
          output: truncated.output,
          ts,
          ...(toolUseId ? { call_id: toolUseId } : {}),
          ...(truncated.truncated ? { truncated: true } : {}),
        });
      } else {
        events.push({
          t: "other",
          raw_type: `user/${(block.type as string | undefined) ?? "unknown"}`,
          data: block,
          ts,
        });
      }
    }
    if (events.length === 0) {
      events.push({
        t: "other",
        raw_type: rawTypeLabel(type, subtype),
        data: raw,
        ts,
      });
    }
    return events;
  }

  if (type === "result") {
    const sessionId = raw.session_id as string | undefined;
    if (sessionId) {
      state.sessionId = sessionId;
    }

    const resultStr = raw.result as string | undefined;
    if (resultStr !== undefined) {
      state.resultText = resultStr;
    }

    state.isError = raw.is_error === true;

    const usage = { ...((raw.usage as Record<string, unknown> | undefined) ?? {}) };
    if (raw.total_cost_usd !== undefined) {
      usage.total_cost_usd = raw.total_cost_usd;
    }
    state.usage = usage;

    events.push({ t: "usage", data: usage, ts });
    events.push({
      t: "lifecycle",
      event: "end",
      data: { subtype: raw.subtype ?? null, is_error: state.isError },
      ts,
    });
    return events;
  }

  if (type === "system" && subtype === "thinking_tokens") {
    events.push({
      t: "other",
      raw_type: rawTypeLabel(type, subtype),
      data: raw,
      ts,
    });
    return events;
  }

  if (type === "rate_limit_event") {
    events.push({
      t: "other",
      raw_type: rawTypeLabel(type, subtype),
      data: raw,
      ts,
    });
    return events;
  }

  events.push({
    t: "other",
    raw_type: rawTypeLabel(type, subtype),
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
