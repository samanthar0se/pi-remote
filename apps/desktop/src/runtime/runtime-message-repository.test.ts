import { describe, expect, it } from "vitest";
import type { ThreadMessageLike } from "@assistant-ui/react";
import { createRuntimeMessageRepository } from "./runtime-message-repository";

describe("createRuntimeMessageRepository", () => {
  it("keeps the complete linear transcript across streaming replacements", () => {
    const previous: ThreadMessageLike[] = [
      { id: "user-1", role: "user", content: "First prompt" },
      { id: "assistant-1", role: "assistant", content: "First answer", status: { type: "complete", reason: "stop" } },
      { id: "user-2", role: "user", content: "Second prompt" },
      { id: "assistant-2", role: "assistant", content: "Streaming", status: { type: "running" } },
    ];
    const updated = [...previous.slice(0, -1), {
      ...previous.at(-1)!,
      content: "Streaming more text",
    }] as ThreadMessageLike[];

    const repository = createRuntimeMessageRepository(updated);

    expect(repository.messages.map(({ message }) => message.id)).toEqual(["user-1", "assistant-1", "user-2", "assistant-2"]);
    expect(repository.messages.map(({ parentId }) => parentId)).toEqual([null, "user-1", "assistant-1", "user-2"]);
    expect(repository.messages.at(-1)?.message.content).toEqual([{ type: "text", text: "Streaming more text" }]);
  });
});
