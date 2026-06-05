"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Megaphone, Trash2, Copy } from "lucide-react";
import {
  getCampaigns,
  deleteCampaign,
  cloneCampaign,
  Campaign,
  CampaignStatus,
} from "@/lib/api";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const statusConfig: Record<
  CampaignStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: "Draft",
    className:
      "bg-muted text-muted-foreground",
  },
  SCHEDULED: {
    label: "Scheduled",
    className: "bg-blue-500/10 text-blue-400",
  },
  RUNNING: {
    label: "Running",
    className: "bg-green-500/10 text-green-400 animate-pulse",
  },
  PAUSED: {
    label: "Paused",
    className: "bg-yellow-500/10 text-yellow-400",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-green-500/10 text-green-400",
  },
  ABORTED: {
    label: "Aborted",
    className: "bg-destructive/10 text-destructive",
  },
};

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    try {
      setLoading(true);
      setError(null);
      const data = await getCampaigns();
      setCampaigns(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load campaigns"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      setDeletingId(id);
      await deleteCampaign(id);
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete campaign"
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClone(id: string) {
    try {
      setCloningId(id);
      const cloned = await cloneCampaign(id);
      router.push(`/campaigns/${cloned.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to clone campaign"
      );
    } finally {
      setCloningId(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Send personalized messages to groups of recipients
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Campaign
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Loading campaigns...
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Megaphone className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">
            No campaigns yet
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Create your first campaign to get started.
          </p>
          <Link
            href="/campaigns/new"
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Create Campaign
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">
                  Template
                </th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">
                  Recipients
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
              {campaigns.map((campaign) => {
                const status = statusConfig[campaign.status];
                const canDelete =
                  campaign.status === "DRAFT" ||
                  campaign.status === "SCHEDULED";
                return (
                  <tr
                    key={campaign.id}
                    className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => router.push(`/campaigns/${campaign.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {campaign.name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {campaign.template?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {campaign._count?.recipients ?? 0}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(campaign.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClone(campaign.id);
                          }}
                          disabled={cloningId === campaign.id}
                          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors disabled:opacity-50"
                          title="Clone"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        {canDelete && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(campaign.id);
                            }}
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Delete Campaign
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to delete &quot;
              {campaigns.find((c) => c.id === confirmDeleteId)?.name}
              &quot;? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deletingId === confirmDeleteId}
                className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {deletingId === confirmDeleteId ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
