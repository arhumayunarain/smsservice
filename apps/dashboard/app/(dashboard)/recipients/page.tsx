"use client";

import { useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import { getToken } from "@/lib/auth";
import {
  RecipientListTable,
  type RecipientList,
} from "@/components/recipients/recipient-list-table";
import { CreateListDialog } from "@/components/recipients/create-list-dialog";

interface CampaignUsage {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

interface DeleteTarget {
  id: string;
  name: string;
  campaigns: CampaignUsage[];
}

function getApiUrl() {
  if (typeof window !== "undefined") return `${window.location.origin}/api`;
  return "/api";
}

function getAuthHeader(): Record<string, string> {
  const token = getToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

const PAGE_LIMIT = 20;

export default function RecipientsPage() {
  const [lists, setLists] = useState<RecipientList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const totalPages = Math.ceil(total / PAGE_LIMIT);

  const [createOpen, setCreateOpen] = useState(false);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [loadingDeleteTarget, setLoadingDeleteTarget] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadLists();
  }, [page]);

  async function loadLists() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${getApiUrl()}/recipient-lists?page=${page}&limit=${PAGE_LIMIT}`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setLists(json.data);
      setTotal(json.total);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load recipient lists"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteClick(id: string) {
    const list = lists.find((l) => l.id === id);
    if (!list) return;

    setLoadingDeleteTarget(true);
    try {
      const res = await fetch(`${getApiUrl()}/recipient-lists/${id}/campaigns`, {
        headers: getAuthHeader(),
      });
      const campaigns: CampaignUsage[] = res.ok ? await res.json() : [];
      setDeleteTarget({ id, name: list.name, campaigns });
    } catch {
      setDeleteTarget({ id, name: list.name, campaigns: [] });
    } finally {
      setLoadingDeleteTarget(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `${getApiUrl()}/recipient-lists/${deleteTarget.id}`,
        { method: "DELETE", headers: getAuthHeader() }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLists((prev) => prev.filter((l) => l.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete list");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Recipients</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage saved recipient lists for your campaigns
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create List
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Name</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Recipients</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Source</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Created</th>
                <th className="text-right px-4 py-3 text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map((i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="h-4 bg-muted/50 rounded animate-pulse w-40" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 bg-muted/50 rounded animate-pulse w-12" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-5 bg-muted/50 rounded-full animate-pulse w-16" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 bg-muted/50 rounded animate-pulse w-24" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <div className="h-7 w-7 bg-muted/50 rounded animate-pulse" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : lists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">No recipient lists yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Create your first list to get started
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Create List
          </button>
        </div>
      ) : (
        <RecipientListTable
          lists={lists}
          onDelete={handleDeleteClick}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-xs text-muted-foreground">
            Showing {(page - 1) * PAGE_LIMIT + 1}–{Math.min(page * PAGE_LIMIT, total)} of {total} lists
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Create List dialog */}
      <CreateListDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={loadLists}
      />

      {/* Loading delete target */}
      {loadingDeleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
              Checking campaign usage...
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Delete Recipient List
            </h3>

            {deleteTarget.campaigns.length > 0 ? (
              <div className="mb-4 space-y-2">
                <p className="text-sm text-muted-foreground">
                  This list was used by{" "}
                  <span className="font-medium text-foreground">
                    {deleteTarget.campaigns.length} campaign
                    {deleteTarget.campaigns.length !== 1 ? "s" : ""}
                  </span>
                  . Those campaigns will keep their recipients but the list
                  reference will be removed.
                </p>
                <div className="rounded-md border border-border divide-y divide-border max-h-40 overflow-y-auto">
                  {deleteTarget.campaigns.map((c) => (
                    <div key={c.id} className="px-3 py-2 text-xs text-muted-foreground">
                      {c.name}
                      <span className="ml-2 px-1.5 py-0.5 bg-muted rounded text-xs">
                        {c.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mb-4">
                Delete &quot;{deleteTarget.name}&quot; and all its entries? This
                action cannot be undone.
              </p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete List"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
