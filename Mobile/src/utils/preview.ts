// src/utils/preview.ts
import type { ChatMessage } from "../types/chat";

export function messagePreview(m?: ChatMessage | null): string {
  if (!m) return "";
  if (m.deletedForEveryone) return "Message deleted";
  switch (m.type) {
    case "voice":
    case "audio":
      return "🎤 Voice message";
    case "image":
      return "📷 Photo";
    case "gif":
      return "GIF";
    case "sticker":
      return `😊 ${m.text || "Sticker"}`;
    case "heart":
      return "❤️";
    case "call":
      return m.callType === "video" ? "📹 Video call" : "📞 Voice call";
    case "system":
      return m.text || "";
    default:
      return m.text || m.content || "";
  }
}
