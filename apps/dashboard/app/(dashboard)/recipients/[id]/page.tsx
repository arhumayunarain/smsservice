"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Plus, Users } from "lucide-react";
import { getToken } from "@/lib/auth";
import {
  RecipientDetailTable,
  type RecipientEntry,
} from "@/components/recipients/recipient-detail-table";

interface RecipientList {
  id: string;
  name: string;
  description: string | null;
  source: string;
  createdAt: string;
  _count: { entries: number };
}

interface EntriesResponse {
  entries: RecipientEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface CampaignUsage {
  id: string;
  name: string;
  status: string;
  createdAt: string;
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

const STATUS_CLASSES: Record<string, string> = {
  RUNNING: "bg-green-500/10 text-green-400",
  COMPLETED: "bg-green-500/10 text-green-400",
  SCHEDULED: "bg-blue-500/10 text-blue-400",
  PAUSED: "bg-yellow-500/10 text-yellow-400",
  DRAFT: "bg-muted text-muted-foreground",
  ABORTED: "bg-destructive/10 text-destructive",
};

export default function RecipientDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;

  const [list, setList] = useState<RecipientList | null>(null);
  const [entriesData, setEntriesData] = useState<EntriesResponse | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline rename state
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Inline description edit
  const [editingDesc, setEditingDesc] = useState(false);
  const [descInput, setDescInput] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);

  // Search
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Add recipient form
  const [addOpen, setAddOpen] = useState(false);
  const [addPhone, setAddPhone] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const page = parseInt(searchParams.get("page") ?? "1", 10);

  const fetchEntries = useCallback(
    async (pageNum: number, searchQuery?: string) => {
      try {
        const params = new URLSearchParams({
          page: String(pageNum),
          limit: "50",
        });
        if (searchQuery) params.set("search", searchQuery);

        const res = await fetch(
          `${getApiUrl()}/recipient-lists/${id}/entries?${params}`,
          { headers: getAuthHeader() }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: EntriesResponse = await res.json();
        setEntriesData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load entries");
      }
    },
    [id]
  );

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      setError(null);
      try {
        const [listRes, campaignsRes] = await Promise.all([
          fetch(`${getApiUrl()}/recipient-lists/${id}`, { headers: getAuthHeader() }),
          fetch(`${getApiUrl()}/recipient-lists/${id}/campaigns`, { headers: getAuthHeader() }),
        ]);

        if (!listRes.ok) {
          if (listRes.status === 404) {
            router.push("/recipients");
            return;
          }
          throw new Error(`HTTP ${listRes.status}`);
        }

        const listData: RecipientList = await listRes.json();
        setList(listData);
        setNameInput(listData.name);
        setDescInput(listData.description ?? "");

        if (campaignsRes.ok) {
          setCampaigns(await campaignsRes.json());
        }

        await fetchEntries(page, search || undefined);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load list");
      } finally {
        setLoading(false);
      }
    }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Re-fetch entries on page change
  useEffect(() => {
    if (!loading) {
      fetchEntries(page, search || undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Debounced search
  function handleSearchChange(val: string) {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchEntries(1, val || undefined);
    }, 300);
  }

  // Pagination via URL params
  function handlePageChange(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`/recipients/${id}?${params.toString()}`);
  }

  // Inline rename
  function startEditName() {
    setNameInput(list?.name ?? "");
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  async function commitRename() {
    if (!list || nameInput.trim() === list.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(`${getApiUrl()}/recipient-lists/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setList((prev) => prev ? { ...prev, name: nameInput.trim() } : prev);
      setEditingName(false);
    } catch {
      setNameInput(list.name);
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  }

  async function commitDescEdit() {
    if (!list || descInput === (list.description ?? "")) {
      setEditingDesc(false);
      return;
    }
    setSavingDesc(true);
    try {
      const res = await fetch(`${getApiUrl()}/recipient-lists/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ description: descInput || null }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setList((prev) => prev ? { ...prev, description: descInput || null } : prev);
      setEditingDesc(false);
    } catch {
      setDescInput(list?.description ?? "");
      setEditingDesc(false);
    } finally {
      setSavingDesc(false);
    }
  }

  // Entry events
  function handleEntryUpdated(entryId: string, field: string, value: string) {
    setEntriesData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        entries: prev.entries.map((e) => {
          if (e.id !== entryId) return e;
          if (field === "phoneNumber") return { ...e, phoneNumber: value };
          return { ...e, variables: { ...(e.variables || {}), [field]: value } };
        }),
      };
    });
  }

  function handleEntryDeleted(entryId: string) {
    setEntriesData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        entries: prev.entries.filter((e) => e.id !== entryId),
        total: prev.total - 1,
      };
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(entryId);
      return next;
    });
    setList((prev) =>
      prev ? { ...prev, _count: { entries: prev._count.entries - 1 } } : prev
    );
  }

  async function handleEntriesDeleted(entryIds: string[]) {
    try {
      const res = await fetch(
        `${getApiUrl()}/recipient-lists/${id}/entries/bulk-delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeader() },
          body: JSON.stringify({ entryIds }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setEntriesData((prev) => {
        if (!prev) return prev;
        const deleted = new Set(entryIds);
        return {
          ...prev,
          entries: prev.entries.filter((e) => !deleted.has(e.id)),
          total: prev.total - entryIds.length,
        };
      });
      setSelectedIds(new Set());
      setList((prev) =>
        prev
          ? { ...prev, _count: { entries: prev._count.entries - entryIds.length } }
          : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete entries");
    }
  }

  async function handleAddRecipient() {
    if (!addPhone.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch(`${getApiUrl()}/recipient-lists/${id}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ phoneNumber: addPhone.trim() }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const newEntry: RecipientEntry = await res.json();
      setEntriesData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          entries: [newEntry, ...prev.entries],
          total: prev.total + 1,
        };
      });
      setList((prev) =>
        prev ? { ...prev, _count: { entries: prev._count.entries + 1 } } : prev
      );
      setAddPhone("");
      setAddOpen(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add recipient");
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="h-8 bg-muted/50 rounded animate-pulse w-64 mb-2" />
        <div className="h-4 bg-muted/50 rounded animate-pulse w-32 mb-6" />
        <div className="rounded-lg border border-border h-64 animate-pulse bg-muted/20" />
      </div>
    );
  }

  if (error && !list) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        href="/recipients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Lists
      </Link>

      {/* Page header */}
      <div className="space-y-1">
        {/* Editable title */}
        <div className="flex items-center gap-2">
          {editingName ? (
            <input
              ref={nameInputRef}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") { setNameInput(list?.name ?? ""); setEditingName(false); }
              }}
              disabled={savingName}
              className="text-2xl font-semibold bg-transparent border-b border-ring focus:outline-none text-foreground"
            />
          ) : (
            <>
              <h1
                className="text-2xl font-semibold text-foreground cursor-pointer hover:text-primary transition-colors"
                onClick={startEditName}
              >
                {list?.name}
              </h1>
              <button
                onClick={startEditName}
                className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                title="Rename list"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 bg-muted/50 rounded-full text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {list?._count.entries.toLocaleString()} recipients
          </span>
        </div>

        {/* Editable description */}
        {editingDesc ? (
          <input
            value={descInput}
            onChange={(e) => setDescInput(e.target.value)}
            onBlur={commitDescEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDescEdit();
              if (e.key === "Escape") { setDescInput(list?.description ?? ""); setEditingDesc(false); }
            }}
            disabled={savingDesc}
            placeholder="Add a description..."
            className="block w-full text-sm text-muted-foreground bg-transparent border-b border-ring focus:outline-none"
            autoFocus
          />
        ) : (
          <p
            onClick={() => { setDescInput(list?.description ?? ""); setEditingDesc(true); }}
            className={`text-sm cursor-pointer hover:text-foreground transition-colors ${
              list?.description ? "text-muted-foreground" : "text-muted-foreground/40 italic"
            }`}
          >
            {list?.description ?? "Click to add a description"}
          </p>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by phone number..."
          className="flex-1 max-w-xs px-3 py-1.5 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Recipient
        </button>
      </div>

      {/* Add recipient form */}
      {addOpen && (
        <div className="p-4 rounded-lg border border-border bg-muted/10 space-y-3">
          <h3 className="text-sm font-medium text-foreground">Add Recipient</h3>
          {addError && (
            <p className="text-sm text-destructive">{addError}</p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={addPhone}
              onChange={(e) => setAddPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRecipient()}
              placeholder="e.g. 03001234567"
              className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            <button
              onClick={handleAddRecipient}
              disabled={!addPhone.trim() || adding}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {adding ? "Adding..." : "Add"}
            </button>
            <button
              onClick={() => { setAddOpen(false); setAddPhone(""); setAddError(null); }}
              className="px-3 py-2 border border-border text-muted-foreground rounded-md text-sm hover:text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Entries table */}
      {entriesData ? (
        <RecipientDetailTable
          listId={id}
          entries={entriesData.entries}
          total={entriesData.total}
          page={entriesData.page}
          totalPages={entriesData.totalPages}
          onEntryUpdated={handleEntryUpdated}
          onEntryDeleted={handleEntryDeleted}
          onEntriesDeleted={handleEntriesDeleted}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onPageChange={handlePageChange}
        />
      ) : (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Loading entries...
        </div>
      )}

      {/* Campaign usage */}
      <div className="pt-2">
        <h2 className="text-base font-semibold text-foreground mb-3">Campaign History</h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This list hasn&apos;t been used in any campaigns yet.
          </p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Campaign</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 text-foreground">{c.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                          STATUS_CLASSES[c.status] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(c.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
