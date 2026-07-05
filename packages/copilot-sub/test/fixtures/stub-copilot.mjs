#!/usr/bin/env node
/**
 * Stub Copilot for tests. Emits observed Copilot JSONL shapes.
 */
import { writeFile } from "node:fs/promises";

if (process.env.STUB_ARGV_FILE) {
  await writeFile(process.env.STUB_ARGV_FILE, JSON.stringify(process.argv.slice(2)));
}

const events = [
  {
    type: "session.tools_updated",
    data: { model: "gpt-5.5" },
    id: "evt-tools",
    timestamp: "2026-07-05T19:54:49.356Z",
    ephemeral: true,
  },
  {
    type: "user.message",
    data: { content: "test prompt", transformedContent: "test prompt" },
    id: "evt-user",
    timestamp: "2026-07-05T19:54:49.359Z",
  },
  {
    type: "assistant.turn_start",
    data: { turnId: "0", interactionId: "interaction-abc" },
    id: "evt-turn-0",
    timestamp: "2026-07-05T19:54:49.365Z",
  },
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
          type: "function",
          intentionSummary: "Run echo hi",
        },
      ],
      turnId: "0",
    },
    id: "evt-tool-request",
    timestamp: "2026-07-05T19:54:51.444Z",
  },
  {
    type: "tool.execution_start",
    data: {
      toolCallId: "call_echo",
      toolName: "bash",
      arguments: { command: "echo hi", description: "Run echo hi" },
      model: "gpt-5.5",
      turnId: "0",
    },
    id: "evt-tool-start",
    timestamp: "2026-07-05T19:54:51.447Z",
  },
  {
    type: "tool.execution_partial_result",
    data: { toolCallId: "call_echo", partialOutput: "hi\n" },
    id: "evt-tool-partial",
    timestamp: "2026-07-05T19:54:51.456Z",
    ephemeral: true,
  },
  {
    type: "tool.execution_complete",
    data: {
      toolCallId: "call_echo",
      model: "gpt-5.5",
      turnId: "0",
      success: true,
      result: {
        content: "hi\n<shellId: 0 completed with exit code 0>",
        detailedContent: "hi\n<shellId: 0 completed with exit code 0>",
        contents: [
          {
            type: "shell_exit",
            shellId: "0",
            exitCode: 0,
            cwd: "/tmp",
            outputPreview: "hi\n",
          },
        ],
      },
    },
    id: "evt-tool-complete",
    timestamp: "2026-07-05T19:54:51.458Z",
  },
  {
    type: "assistant.message_start",
    data: { messageId: "msg-final", phase: "final_answer" },
    id: "evt-message-start",
    timestamp: "2026-07-05T19:54:52.407Z",
    ephemeral: true,
  },
  {
    type: "assistant.message_delta",
    data: { messageId: "msg-final", deltaContent: "Done! Here is the result." },
    id: "evt-message-delta",
    timestamp: "2026-07-05T19:54:52.453Z",
    ephemeral: true,
  },
  {
    type: "assistant.message",
    data: {
      messageId: "msg-final",
      model: "gpt-5.5",
      content: "Done! Here is the result.",
      toolRequests: [],
      turnId: "1",
      phase: "final_answer",
      outputTokens: 8,
    },
    id: "evt-message-final",
    timestamp: "2026-07-05T19:54:52.642Z",
  },
  {
    type: "assistant.reasoning",
    data: { reasoningId: "reasoning-abc", content: "brief reasoning summary" },
    id: "evt-reasoning",
    timestamp: "2026-07-05T19:54:52.643Z",
    ephemeral: true,
  },
  {
    type: "assistant.turn_end",
    data: { turnId: "1" },
    id: "evt-turn-end",
    timestamp: "2026-07-05T19:54:52.644Z",
  },
  {
    type: "result",
    timestamp: "2026-07-05T19:54:52.656Z",
    sessionId: "copilot-session-abc123",
    exitCode: 0,
    usage: {
      premiumRequests: 7.5,
      totalApiDurationMs: 3079,
      sessionDurationMs: 4263,
      codeChanges: { linesAdded: 0, linesRemoved: 0, filesModified: [] },
    },
  },
];

for (const event of events) {
  process.stdout.write(JSON.stringify(event) + "\n");
}

process.exit(0);
