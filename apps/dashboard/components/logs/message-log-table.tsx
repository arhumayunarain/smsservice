"use client";

import { useState } from "react";
import { MessageLog } from "@/lib/api";
import { format } from "date-fns";

interface MessageLogTableProps {
  messages: MessageLog[];
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-zinc-700 text-zinc-300",
  QUEUED: "bg-blue-900/60 text-blue-300",
  SENT_TO_DEVICE: "bg-amber-900/60 text-amber-300",
  DELIVERED: "bg-green-900/60 text-green-300",
  FAILED: "bg-red-900/60 text-red-300",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  QUEUED: "Queued",
  SENT_TO_DEVICE: "Sent",
  DELIVERED: "Delivered",
  FAILED: "Failed",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[status] ?? "bg-zinc-700 text-zinc-300"}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function truncate(str: string, len: number) {
  return str.length > len ? str.slice(0, len) + "…" : str;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d, HH:mm:ss");
  } catch {
    return iso;
  }
}

export function MessageLogTable({
  messages,
  total,
  page,
  totalPages,
  onPageChange,
}: MessageLogTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Table */}
      <div className="overflow-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50 text-muted-foreground bg-accent/10">
              <th className="text-left px-3 py-2 font-medium">Phone</th>
              <th className="text-left px-3 py-2 font-medium">Message</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Campaign</th>
              <th className="text-left px-3 py-2 font-medium">Device</th>
              <th className="text-left px-3 py-2 font-medium">Queued At</th>
              <th className="text-left px-3 py-2 font-medium">Delivered / Failed At</th>
              <th className="text-left px-3 py-2 font-medium">Failure Reason</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {messages.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  No messages found.
                </td>
              </tr>
            ) : (
              messages.map((m) => {
                const isExpanded = expanded.has(m.id);
                const deliveredOrFailedAt =
                  m.status === "DELIVERED"
                    ? m.deliveredAt
                    : m.status === "FAILED"
                    ? m.sentAt ?? m.deliveredAt
                    : null;

                return (
                  <>
                    <tr
                      key={m.id}
                      className="border-b border-border/30 hover:bg-accent/20 cursor-pointer"
                      onClick={() => toggleExpand(m.id)}
                    >
                      <td className="px-3 py-2 font-mono text-foreground">{m.recipient}</td>
                      <td className="px-3 py-2 text-muted-foreground max-w-[200px]">
                        {truncate(m.body, 60)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={m.status} />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {m.campaign?.name ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {m.device?.name ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {fmtDate(m.queuedAt)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {fmtDate(deliveredOrFailedAt ?? null)}
                      </td>
                      <td className="px-3 py-2 text-red-400 max-w-[160px]">
                        {m.error ? truncate(m.error, 40) : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {isExpanded ? "▲" : "▼"}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${m.id}-details`} className="bg-accent/10 border-b border-border/30">
                        <td colSpan={9} className="px-4 py-3">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <div className="text-muted-foreground mb-1 font-medium uppercase tracking-wide text-[10px]">
                                Full Message
                              </div>
                              <p className="text-foreground break-words">{m.body}</p>
                            </div>
                            <div className="space-y-1.5">
                              <div>
                                <span className="text-muted-foreground">Message ID:</span>{" "}
                                <span className="font-mono text-foreground">{m.id}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Created:</span>{" "}
                                <span className="text-foreground">{fmtDate(m.createdAt)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Queued:</span>{" "}
                                <span className="text-foreground">{fmtDate(m.queuedAt)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Sent to device:</span>{" "}
                                <span className="text-foreground">{fmtDate(m.sentAt)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Delivered:</span>{" "}
                                <span className="text-foreground">{fmtDate(m.deliveredAt)}</span>
                              </div>
                              {m.error && (
                                <div>
                                  <span className="text-muted-foreground">Failure reason:</span>{" "}
                                  <span className="text-red-400">{m.error}</span>
                                </div>
                              )}
                              {m.campaign && (
                                <div>
                                  <span className="text-muted-foreground">Template:</span>{" "}
                                  <span className="text-foreground">{m.campaign.template?.name ?? "—"}</span>
                                </div>
                              )}
                              {m.campaignRecipient?.variables &&
                                Object.keys(m.campaignRecipient.variables).length > 0 && (
                                  <div>
                                    <span className="text-muted-foreground">Variables:</span>{" "}
                                    <span className="font-mono text-foreground text-[10px]">
                                      {JSON.stringify(m.campaignRecipient.variables)}
                                    </span>
                                  </div>
                                )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {total} total message{total !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="px-2 py-1 rounded border border-border hover:bg-accent/50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="px-2 py-1 rounded border border-border hover:bg-accent/50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
      {totalPages <= 1 && (
        <div className="text-xs text-muted-foreground">
          {total} total message{total !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
