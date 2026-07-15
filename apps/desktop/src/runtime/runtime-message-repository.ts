import { ExportedMessageRepository, type ThreadMessageLike } from "@assistant-ui/react";

export function createRuntimeMessageRepository(messages: readonly ThreadMessageLike[]): ExportedMessageRepository {
  return ExportedMessageRepository.fromArray(messages);
}
