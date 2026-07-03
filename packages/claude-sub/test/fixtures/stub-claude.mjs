#!/usr/bin/env node
/**
 * Stub claude for tests. Emits a canned stream-json sequence.
 */
const events = [
  {
    type: "system",
    subtype: "init",
    session_id: "claude-session-abc123",
    cwd: "/tmp/test",
    model: "claude-sonnet-4-20250514",
    tools: ["Read", "Write", "Bash"],
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
];

for (const event of events) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

process.exit(0);
