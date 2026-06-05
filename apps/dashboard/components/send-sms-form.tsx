"use client";

import { useState } from "react";
import { sendSms, type Message } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

interface SentMessage {
  id: string;
  recipient: string;
  status: Message["status"];
  sentAt: string;
}

const MAX_SMS_CHARS = 160;

export function SendSmsForm() {
  const [recipients, setRecipients] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);

  const charCount = body.length;
  const segments = charCount === 0 ? 0 : Math.ceil(charCount / MAX_SMS_CHARS);

  async function handleSend() {
    const recipientList = recipients
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    if (recipientList.length === 0) {
      setError("Enter at least one recipient");
      return;
    }
    if (!body.trim()) {
      setError("Enter a message");
      return;
    }

    setError("");
    setSending(true);

    try {
      const result = await sendSms({ recipient: recipients, body });
      const messages = Array.isArray(result) ? result : [result];
      const newSent: SentMessage[] = messages.map((msg) => ({
        id: msg.id,
        recipient: msg.recipient,
        status: msg.status,
        sentAt: msg.createdAt,
      }));
      setSentMessages((prev) => [...newSent, ...prev]);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : "Failed to send";
      setError(errMsg);
    }

    setSending(false);
    setRecipients("");
    setBody("");
  }

  return (
    <div className="space-y-5">
      {/* Form */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Recipients</Label>
          <Input
            placeholder="923001234567, 923009876543"
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated phone numbers (format: 923xxxxxxxxx)
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Message</Label>
          <Textarea
            placeholder="Type your message..."
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <p className="text-xs text-muted-foreground text-right">
            {charCount} / {MAX_SMS_CHARS} chars
            {segments > 0 && `, ${segments} segment${segments > 1 ? "s" : ""}`}
          </p>
        </div>

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}

        <Button
          onClick={handleSend}
          disabled={sending}
          className="w-full sm:w-auto"
        >
          {sending ? "Sending..." : "Send"}
        </Button>
      </div>

      {/* Delivery tracking */}
      {sentMessages.length > 0 && (
        <div className="border border-border rounded-md overflow-hidden">
          <div className="px-3 py-2 bg-muted/30 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Delivery Status
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">Recipient</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {sentMessages.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-border/50 last:border-0"
                >
                  <td className="px-3 py-2 font-mono text-muted-foreground">
                    {m.recipient}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={getStatusVariant(m.status)}>
                      {getStatusLabel(m.status)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDistanceToNow(m.sentAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
