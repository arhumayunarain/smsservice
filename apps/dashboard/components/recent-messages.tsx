"use client";

import { useEffect, useState } from "react";
import { getMessages, type Message } from "@/lib/api";
import { socket } from "@/lib/socket";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "@/lib/time";

type StatusVariant = "warning" | "info" | "success" | "destructive" | "secondary";

function getStatusVariant(status: Message["status"]): StatusVariant {
  switch (status) {
    case "QUEUED": return "warning";
    case "SENT_TO_DEVICE": return "info";
    case "DELIVERED": return "success";
    case "FAILED": return "destructive";
    default: return "secondary";
  }
}

function getStatusLabel(status: Message["status"]): string {
  switch (status) {
    case "QUEUED": return "Queued";
    case "SENT_TO_DEVICE": return "Sent";
    case "DELIVERED": return "Delivered";
    case "FAILED": return "Failed";
    default: return status;
  }
}

export function RecentMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMessages(20)
      .then(setMessages)
      .catch(console.error)
      .finally(() => setLoading(false));

    function onStatusUpdated(payload: {
      messageId: string;
      status: Message["status"];
    }) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.messageId ? { ...m, status: payload.status } : m
        )
      );
    }

    socket.on("sms:status_updated", onStatusUpdated);
    return () => {
      socket.off("sms:status_updated", onStatusUpdated);
    };
  }, []);

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground px-4 py-4 text-center">
        Loading messages...
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="text-xs text-muted-foreground px-4 py-4 text-center">
        No messages sent yet.
      </div>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border text-muted-foreground">
          <th className="text-left px-3 py-2 font-medium">Recipient</th>
          <th className="text-left px-3 py-2 font-medium">Message</th>
          <th className="text-left px-3 py-2 font-medium">Status</th>
          <th className="text-left px-3 py-2 font-medium">Time</th>
        </tr>
      </thead>
      <tbody>
        {messages.map((msg) => (
          <tr
            key={msg.id}
            className="border-b border-border/50 hover:bg-accent/20 transition-colors"
          >
            <td className="px-3 py-2 font-mono text-muted-foreground">
              {msg.recipient}
            </td>
            <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">
              {msg.body.length > 50 ? `${msg.body.slice(0, 50)}…` : msg.body}
            </td>
            <td className="px-3 py-2">
              <Badge variant={getStatusVariant(msg.status)}>
                {getStatusLabel(msg.status)}
              </Badge>
            </td>
            <td className="px-3 py-2 text-muted-foreground">
              {formatDistanceToNow(msg.createdAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
