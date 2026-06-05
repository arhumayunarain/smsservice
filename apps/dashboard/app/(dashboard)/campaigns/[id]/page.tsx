"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  RotateCcw,
  Clock,
  Send,
  Trash2,
  Pencil,
  CheckCircle2,
  XCircle,
  Clock3,
  ArrowUpCircle,
  Gauge,
  AlertTriangle,
  Copy,
} from "lucide-react";
import {
  getCampaign,
  getCampaignProgress,
  getCampaignQueueStats,
  sendCampaign,
  pauseCampaign,
  resumeCampaign,
  abortCampaign,
  retryCampaign,
  deleteCampaign,
  cloneCampaign,
  Campaign,
  CampaignProgress,
  CampaignStatus,
  QueueStats,
  Message,
} from "@/lib/api";
import { socket } from "@/lib/socket";
import { renderTemplate } from "@/lib/sms-utils";

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEta(etaSeconds: number | null): string {
  if (etaSeconds === null) return "—";
  if (etaSeconds < 60) return `~${etaSeconds}s`;
  if (etaSeconds < 3600) return `~${Math.ceil(etaSeconds / 60)}min`;
  return `~${Math.ceil(etaSeconds / 3600)}hr`;
}

function formatRateLimit(rateLimit: { max: number; duration: number } | null): string {
  if (!rateLimit) return "Unlimited";
  const isPerHour = rateLimit.duration >= 3_600_000;
  return `${rateLimit.max}/${isPerHour ? "hr" : "min"}`;
}

const statusConfig: Record<
  CampaignStatus,
  { label: string; className: string }
> = {
  DRAFT: { label: "Draft", className: "bg-muted text-muted-foreground" },
  SCHEDULED: {
    label: "Scheduled",
    className: "bg-blue-500/10 text-blue-400",
  },
  RUNNING: {
    label: "Running",
    className: "bg-green-500/10 text-green-400 animate-pulse",
  },
  PAUSED: { label: "Paused", className: "bg-yellow-500/10 text-yellow-400" },
  COMPLETED: {
    label: "Completed",
    className: "bg-green-500/10 text-green-400",
  },
  ABORTED: {
    label: "Aborted",
    className: "bg-destructive/10 text-destructive",
  },
};

const messageStatusConfig: Record<
  string,
  { icon: React.ElementType; label: string; className: string }
> = {
  PENDING: { icon: Clock3, label: "Pending", className: "text-muted-foreground" },
  QUEUED: { icon: Clock3, label: "Queued", className: "text-muted-foreground" },
  SENT_TO_DEVICE: {
    icon: ArrowUpCircle,
    label: "Sent to Device",
    className: "text-blue-400",
  },
  DELIVERED: {
    icon: CheckCircle2,
    label: "Delivered",
    className: "text-green-400",
  },
  FAILED: { icon: XCircle, label: "Failed", className: "text-destructive" },
};

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [progress, setProgress] = useState<CampaignProgress | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [autoPausedBanner, setAutoPausedBanner] = useState(false);

  const queuePollRef = useRef<NodeJS.Timeout | null>(null);

  const loadCampaign = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        getCampaign(id),
        getCampaignProgress(id),
      ]);
      setCampaign(c);
      setProgress(p);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load campaign"
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadQueueStats = useCallback(async () => {
    try {
      const stats = await getCampaignQueueStats(id);
      setQueueStats(stats);
    } catch {
      // ignore — stats are non-critical
    }
  }, [id]);

  useEffect(() => {
    loadCampaign();
  }, [loadCampaign]);

  // Poll queue stats every 5 seconds when RUNNING
  useEffect(() => {
    if (campaign?.status === "RUNNING") {
      loadQueueStats();
      queuePollRef.current = setInterval(loadQueueStats, 5000);
    } else {
      if (queuePollRef.current) {
        clearInterval(queuePollRef.current);
        queuePollRef.current = null;
      }
    }
    return () => {
      if (queuePollRef.current) {
        clearInterval(queuePollRef.current);
      }
    };
  }, [campaign?.status, loadQueueStats]);

  // Socket.IO for live progress updates
  useEffect(() => {
    socket.connect();

    function handleProgress(data: CampaignProgress) {
      if (data.campaignId === id) {
        setProgress(data);
      }
    }

    function handleSmsStatus(data: { messageId: string; status: string; error?: string }) {
      setCampaign((prev) => {
        if (!prev?.recipients) return prev;
        const idx = prev.recipients.findIndex((r) => r.message?.id === data.messageId);
        if (idx === -1) return prev;
        const updated = { ...prev, recipients: [...prev.recipients] };
        updated.recipients[idx] = {
          ...updated.recipients[idx],
          message: {
            ...updated.recipients[idx].message!,
            status: data.status as Message["status"],
            error: data.error ?? null,
          },
        };
        return updated;
      });
    }

    function handleCampaignStatus(data: { campaignId: string; status: string }) {
      if (data.campaignId === id) {
        setCampaign((prev) => prev ? { ...prev, status: data.status as CampaignStatus } : prev);
      }
    }

    function handleAutoPaused(data: { reason: string; campaignIds: string[] }) {
      if (data.campaignIds.includes(id)) {
        setAutoPausedBanner(true);
        // Reload campaign to reflect new PAUSED status
        loadCampaign();
      }
    }

    socket.on("campaign:progress_updated", handleProgress);
    socket.on("sms:status_updated", handleSmsStatus);
    socket.on("campaign:status_changed", handleCampaignStatus);
    socket.on("campaign:auto-paused", handleAutoPaused);

    return () => {
      socket.off("campaign:progress_updated", handleProgress);
      socket.off("sms:status_updated", handleSmsStatus);
      socket.off("campaign:status_changed", handleCampaignStatus);
      socket.off("campaign:auto-paused", handleAutoPaused);
    };
  }, [id, loadCampaign]);

  async function handleAction(
    action: () => Promise<void>,
    successMessage?: string
  ) {
    setActionLoading(true);
    setError(null);
    try {
      await action();
      await loadCampaign();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSendNow() {
    setShowSendConfirm(false);
    await handleAction(() => sendCampaign(id));
  }

  async function handleDelete() {
    setShowDeleteConfirm(false);
    setActionLoading(true);
    try {
      await deleteCampaign(id);
      router.push("/campaigns");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete campaign"
      );
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-sm text-muted-foreground text-center py-8">
          Loading campaign...
        </p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-sm text-destructive text-center py-8">
          {error ?? "Campaign not found"}
        </p>
      </div>
    );
  }

  const status = statusConfig[campaign.status];
  const showProgress =
    campaign.status === "RUNNING" ||
    campaign.status === "PAUSED" ||
    campaign.status === "COMPLETED" ||
    campaign.status === "ABORTED";

  const showQueueStats =
    campaign.status === "RUNNING" || campaign.status === "PAUSED";

  const progressPercent =
    progress && progress.total > 0
      ? ((progress.sent + progress.failed) / progress.total) * 100
      : 0;
  const sentPercent =
    progress && progress.total > 0
      ? (progress.sent / progress.total) * 100
      : 0;
  const failedPercent =
    progress && progress.total > 0
      ? (progress.failed / progress.total) * 100
      : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Navigation */}
      <button
        onClick={() => router.push("/campaigns")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Campaigns
      </button>

      {/* Auto-pause banner */}
      {autoPausedBanner && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
          <p className="text-sm text-yellow-400">
            Campaign auto-paused: the last connected device went offline. Reconnect a device and resume to continue.
          </p>
          <button
            onClick={() => setAutoPausedBanner(false)}
            className="ml-auto text-yellow-400/60 hover:text-yellow-400 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold text-foreground">
              {campaign.name}
            </h1>
            <span
              className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${status.className}`}
            >
              {status.label}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span>
              Template: <strong>{campaign.template?.name}</strong>
            </span>
            <span>
              Device: <strong>{campaign.device?.name ?? "—"}</strong>
            </span>
            <span>Created: {formatDate(campaign.createdAt)}</span>
            {campaign.scheduledAt && (
              <span>
                Scheduled: {formatDate(campaign.scheduledAt)}
                {campaign.timezone ? ` (${campaign.timezone})` : ""}
              </span>
            )}
            {campaign.startedAt && (
              <span>Started: {formatDate(campaign.startedAt)}</span>
            )}
            {campaign.completedAt && (
              <span>Completed: {formatDate(campaign.completedAt)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        {campaign.status === "DRAFT" && (
          <>
            <button
              onClick={() => setShowSendConfirm(true)}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Send Now
            </button>
            <button
              onClick={() => router.push(`/campaigns/new`)}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground rounded-md text-sm hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <Clock className="h-4 w-4" />
              Schedule
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground rounded-md text-sm hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </>
        )}

        {campaign.status === "SCHEDULED" && (
          <>
            <button
              onClick={() =>
                handleAction(() => abortCampaign(id))
              }
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground rounded-md text-sm hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              <Square className="h-4 w-4" />
              Cancel Schedule
            </button>
          </>
        )}

        {campaign.status === "RUNNING" && (
          <>
            <button
              onClick={() => handleAction(() => pauseCampaign(id))}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-md text-sm font-medium hover:bg-yellow-700 transition-colors disabled:opacity-50"
            >
              <Pause className="h-4 w-4" />
              Pause
            </button>
            <button
              onClick={() => handleAction(() => abortCampaign(id))}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              <Square className="h-4 w-4" />
              Abort
            </button>
          </>
        )}

        {campaign.status === "PAUSED" && (
          <>
            <button
              onClick={() => handleAction(() => resumeCampaign(id))}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              Resume
            </button>
            <button
              onClick={() => handleAction(() => abortCampaign(id))}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              <Square className="h-4 w-4" />
              Abort
            </button>
          </>
        )}

        {(campaign.status === "COMPLETED" || campaign.status === "ABORTED") &&
          progress &&
          progress.failed > 0 && (
            <button
              onClick={() => handleAction(() => retryCampaign(id))}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Retry Failed ({progress.failed})
            </button>
          )}

        {(campaign.status === "DRAFT" ||
          campaign.status === "COMPLETED" ||
          campaign.status === "ABORTED") && (
          <button
            onClick={async () => {
              setActionLoading(true);
              try {
                const cloned = await cloneCampaign(id);
                router.push(`/campaigns/${cloned.id}`);
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Failed to clone campaign"
                );
                setActionLoading(false);
              }
            }}
            disabled={actionLoading}
            className="flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground rounded-md text-sm hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
            Clone
          </button>
        )}
      </div>

      {/* Queue Stats Panel (shown when RUNNING or PAUSED) */}
      {showQueueStats && (
        <div className="rounded-lg border border-border p-4 mb-6 bg-muted/10">
          <div className="flex items-center gap-2 mb-3">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">Queue Stats</h2>
            {campaign.status === "RUNNING" && (
              <span className="ml-auto text-xs text-muted-foreground">Refreshing every 5s</span>
            )}
          </div>
          {queueStats ? (
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Queue depth</span>
                <p className="font-semibold text-foreground">{queueStats.waiting}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Active</span>
                <p className="font-semibold text-foreground">{queueStats.active}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Est. completion</span>
                <p className="font-semibold text-foreground">{formatEta(queueStats.etaSeconds)}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Rate limit</span>
                <div className="flex items-center gap-1">
                  <p className="font-semibold text-foreground">{formatRateLimit(queueStats.rateLimit)}</p>
                  {queueStats.rateLimit && (
                    <Gauge className="h-3 w-3 text-yellow-400" />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Loading queue stats...</p>
          )}
        </div>
      )}

      {/* Progress Section */}
      {showProgress && progress && (
        <div className="rounded-lg border border-border p-4 mb-6">
          <h2 className="text-sm font-medium text-foreground mb-3">
            Progress
          </h2>

          {/* Progress bar */}
          <div className="relative h-4 bg-muted rounded-full overflow-hidden mb-3">
            {/* Sent portion (green) */}
            <div
              className="absolute left-0 top-0 h-full bg-green-500 transition-all duration-500 ease-out"
              style={{ width: `${sentPercent}%` }}
            />
            {/* Failed portion (red), stacked after sent */}
            <div
              className="absolute top-0 h-full bg-destructive transition-all duration-500 ease-out"
              style={{
                left: `${sentPercent}%`,
                width: `${failedPercent}%`,
              }}
            />
          </div>

          {/* Counters */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-green-400">
              Sent: <strong>{progress.sent}</strong>
            </span>
            <span className="text-muted-foreground">
              Pending: <strong>{progress.pending}</strong>
            </span>
            <span className="text-destructive">
              Failed: <strong>{progress.failed}</strong>
            </span>
            <span className="text-foreground">
              Total: <strong>{progress.total}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Message List */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-3">
          Recipients ({campaign.recipients?.length ?? 0})
        </h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">
                  Phone Number
                </th>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">
                  Message
                </th>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">
                  Status
                </th>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">
                  Error
                </th>
              </tr>
            </thead>
            <tbody>
              {(campaign.recipients ?? []).map((r) => {
                const rendered = campaign.template
                  ? renderTemplate(
                      campaign.template.body,
                      r.variables as Record<string, string>
                    )
                  : "";
                const msgStatus = r.message?.status ?? "QUEUED";
                const statusInfo =
                  messageStatusConfig[msgStatus] ?? messageStatusConfig.QUEUED;
                const StatusIcon = statusInfo.icon;
                const isFailed = msgStatus === "FAILED";

                return (
                  <tr
                    key={r.id}
                    className={`border-b border-border last:border-b-0 ${
                      isFailed ? "bg-destructive/5" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 font-mono text-foreground">
                      {r.phoneNumber}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground max-w-xs truncate">
                      {r.message?.body ?? rendered}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`flex items-center gap-1.5 ${statusInfo.className}`}
                      >
                        <StatusIcon className="h-3.5 w-3.5" />
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-destructive text-xs">
                      {r.message?.error ?? ""}
                    </td>
                  </tr>
                );
              })}
              {(campaign.recipients ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-muted-foreground"
                  >
                    No recipients
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Send Confirmation Dialog */}
      {showSendConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Send Campaign Now
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              You are about to send{" "}
              <strong className="text-foreground">
                {campaign.recipients?.length ?? 0}
              </strong>{" "}
              messages. Proceed?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSendConfirm(false)}
                className="px-4 py-2 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendNow}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Send Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Delete Campaign
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to delete &quot;{campaign.name}&quot;? This
              action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
