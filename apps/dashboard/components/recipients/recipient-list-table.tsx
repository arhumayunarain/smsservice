"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export interface RecipientList {
  id: string;
  name: string;
  source: string;
  description: string | null;
  createdAt: string;
  _count: { entries: number };
}

interface RecipientListTableProps {
  lists: RecipientList[];
  onDelete: (id: string) => void;
  onRowClick?: (id: string) => void;
}

const SOURCE_LABELS: Record<string, { label: string; className: string }> = {
  CSV: { label: "CSV", className: "bg-blue-500/10 text-blue-400" },
  XLSX: { label: "Excel", className: "bg-green-500/10 text-green-400" },
  SHEETS: { label: "Google Sheets", className: "bg-yellow-500/10 text-yellow-400" },
  POSTEX: { label: "PostEx", className: "bg-purple-500/10 text-purple-400" },
  MANUAL: { label: "Manual", className: "bg-muted text-muted-foreground" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function RecipientListTable({
  lists,
  onDelete,
  onRowClick,
}: RecipientListTableProps) {
  const router = useRouter();

  function handleRowClick(id: string) {
    if (onRowClick) {
      onRowClick(id);
    } else {
      router.push(`/recipients/${id}`);
    }
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/30 border-b border-border">
            <th className="text-left px-4 py-3 text-muted-foreground font-medium">
              Name
            </th>
            <th className="text-left px-4 py-3 text-muted-foreground font-medium">
              Recipients
            </th>
            <th className="text-left px-4 py-3 text-muted-foreground font-medium">
              Source
            </th>
            <th className="text-left px-4 py-3 text-muted-foreground font-medium">
              Created
            </th>
            <th className="text-right px-4 py-3 text-muted-foreground font-medium">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {lists.map((list) => {
            const sourceConfig = SOURCE_LABELS[list.source] ?? {
              label: list.source,
              className: "bg-muted text-muted-foreground",
            };
            return (
              <tr
                key={list.id}
                className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer"
                onClick={() => handleRowClick(list.id)}
              >
                <td className="px-4 py-3 font-medium text-foreground">
                  {list.name}
                  {list.description && (
                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                      {list.description}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {list._count.entries.toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${sourceConfig.className}`}
                  >
                    {sourceConfig.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDate(list.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(list.id);
                      }}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                      title="Delete list"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
