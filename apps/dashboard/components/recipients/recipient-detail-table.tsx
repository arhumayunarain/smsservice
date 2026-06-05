"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { EditableCell } from "./editable-cell";

export interface RecipientEntry {
  id: string;
  listId: string;
  phoneNumber: string;
  variables: Record<string, string>;
  createdAt: string;
}

interface RecipientDetailTableProps {
  listId: string;
  entries: RecipientEntry[];
  total: number;
  page: number;
  totalPages: number;
  onEntryUpdated: (entryId: string, field: "phoneNumber" | string, value: string) => void;
  onEntryDeleted: (entryId: string) => void;
  onEntriesDeleted: (entryIds: string[]) => void;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onPageChange: (page: number) => void;
}

function getVariableColumns(entries: RecipientEntry[]): string[] {
  const keys = new Set<string>();
  for (const entry of entries) {
    if (entry.variables && typeof entry.variables === "object") {
      for (const key of Object.keys(entry.variables)) {
        keys.add(key);
      }
    }
  }
  return Array.from(keys);
}

export function RecipientDetailTable({
  listId,
  entries,
  total,
  page,
  totalPages,
  onEntryUpdated,
  onEntryDeleted,
  onEntriesDeleted,
  selectedIds,
  onSelectionChange,
  onPageChange,
}: RecipientDetailTableProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const variableColumns = getVariableColumns(entries);
  const allSelected = entries.length > 0 && entries.every((e) => selectedIds.has(e.id));
  const someSelected = selectedIds.size > 0;

  function toggleSelectAll() {
    if (allSelected) {
      // Deselect all on current page
      const newSet = new Set(selectedIds);
      entries.forEach((e) => newSet.delete(e.id));
      onSelectionChange(newSet);
    } else {
      // Select all on current page
      const newSet = new Set(selectedIds);
      entries.forEach((e) => newSet.add(e.id));
      onSelectionChange(newSet);
    }
  }

  function toggleSelect(id: string) {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    onSelectionChange(newSet);
  }

  async function handleSavePhoneNumber(entryId: string, newValue: string) {
    const apiUrl = typeof window !== "undefined" ? `${window.location.origin}/api` : "/api";
    const token = typeof window !== "undefined" ? localStorage.getItem("sms_admin_token") : null;

    const res = await fetch(`${apiUrl}/recipient-lists/${listId}/entries/${entryId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ phoneNumber: newValue }),
    });

    if (res.status === 404) return; // Entry deleted elsewhere — silent ignore
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }

    onEntryUpdated(entryId, "phoneNumber", newValue);
  }

  async function handleSaveVariable(entryId: string, entry: RecipientEntry, key: string, newValue: string) {
    const apiUrl = typeof window !== "undefined" ? `${window.location.origin}/api` : "/api";
    const token = typeof window !== "undefined" ? localStorage.getItem("sms_admin_token") : null;

    const updatedVariables = { ...(entry.variables || {}), [key]: newValue };

    const res = await fetch(`${apiUrl}/recipient-lists/${listId}/entries/${entryId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ variables: updatedVariables }),
    });

    if (res.status === 404) return;
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }

    onEntryUpdated(entryId, key, newValue);
  }

  async function handleDeleteEntry(entryId: string) {
    const apiUrl = typeof window !== "undefined" ? `${window.location.origin}/api` : "/api";
    const token = typeof window !== "undefined" ? localStorage.getItem("sms_admin_token") : null;

    const res = await fetch(`${apiUrl}/recipient-lists/${listId}/entries/${entryId}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok && res.status !== 404) {
      console.error("Failed to delete entry:", res.status);
      return;
    }

    onEntryDeleted(entryId);
  }

  const pageFrom = (page - 1) * 50 + 1;
  const pageTo = Math.min(page * 50, total);

  return (
    <div className="space-y-3">
      {someSelected && (
        <div className="flex items-center gap-3 px-3 py-2 bg-primary/10 border border-primary/30 rounded-md">
          <span className="text-sm text-foreground">
            {selectedIds.size} selected
          </span>
          <button
            onClick={() => setConfirmBulkDelete(true)}
            className="flex items-center gap-1.5 px-3 py-1 text-sm bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Selected
          </button>
          <button
            onClick={() => onSelectionChange(new Set())}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors ml-auto"
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="rounded-lg border border-border overflow-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-border"
                />
              </th>
              <th className="text-left px-3 py-3 text-muted-foreground font-medium whitespace-nowrap">
                Phone Number
              </th>
              {variableColumns.map((col) => (
                <th key={col} className="text-left px-3 py-3 text-muted-foreground font-medium whitespace-nowrap">
                  {col}
                </th>
              ))}
              <th className="text-right px-3 py-3 text-muted-foreground font-medium w-12">
                {/* Actions */}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className={`border-b border-border last:border-b-0 transition-colors ${
                  selectedIds.has(entry.id) ? "bg-primary/5" : "hover:bg-muted/20"
                }`}
              >
                <td className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(entry.id)}
                    onChange={() => toggleSelect(entry.id)}
                    className="rounded border-border"
                  />
                </td>
                <td className="px-3 py-2.5 font-mono">
                  <EditableCell
                    value={entry.phoneNumber}
                    onSave={(v) => handleSavePhoneNumber(entry.id, v)}
                  />
                </td>
                {variableColumns.map((col) => (
                  <td key={col} className="px-3 py-2.5">
                    <EditableCell
                      value={(entry.variables?.[col] as string) ?? ""}
                      onSave={(v) => handleSaveVariable(entry.id, entry, col, v)}
                      placeholder="—"
                    />
                  </td>
                ))}
                <td className="px-3 py-2.5">
                  <div className="flex justify-end">
                    <button
                      onClick={() => setConfirmDeleteId(entry.id)}
                      className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                      title="Delete entry"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            Showing {pageFrom.toLocaleString()}–{pageTo.toLocaleString()} of{" "}
            {total.toLocaleString()} recipients
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No recipients in this list yet. Add recipients manually or import from a file.
        </div>
      )}

      {/* Single entry delete confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Delete Entry
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to delete this recipient entry? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDeleteEntry(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Delete {selectedIds.size} Entries
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to delete{" "}
              <strong className="text-foreground">{selectedIds.size}</strong>{" "}
              selected recipient{selectedIds.size !== 1 ? "s" : ""}? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmBulkDelete(false)}
                className="px-4 py-2 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onEntriesDeleted(Array.from(selectedIds));
                  setConfirmBulkDelete(false);
                }}
                className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Delete {selectedIds.size} Entries
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
