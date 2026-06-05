"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDashboardStats,
  getDailySendCounts,
  getCampaignHistory,
  type DashboardStats,
  type DailySendCount,
  type CampaignHistoryEntry,
} from "@/lib/api";
import { socket } from "@/lib/socket";
import { RecentMessages } from "@/components/recent-messages";
import { SummaryStats } from "@/components/dashboard/summary-stats";
import { TrendChart } from "@/components/dashboard/trend-chart";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "text-zinc-400",
  SCHEDULED: "text-blue-400",
  RUNNING: "text-amber-400",
  PAUSED: "text-yellow-400",
  COMPLETED: "text-green-400",
  ABORTED: "text-red-400",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [data7, setData7] = useState<DailySendCount[]>([]);
  const [data30, setData30] = useState<DailySendCount[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<CampaignHistoryEntry[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const statsRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chartRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const s = await getDashboardStats();
      setStats(s);
    } catch (err) {
      console.error("Failed to load stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadChart = useCallback(async () => {
    try {
      const [d7, d30] = await Promise.all([
        getDailySendCounts(7),
        getDailySendCounts(30),
      ]);
      setData7(d7);
      setData30(d30);
    } catch (err) {
      console.error("Failed to load chart data:", err);
    } finally {
      setChartLoading(false);
    }
  }, []);

  const loadCampaigns = useCallback(async () => {
    try {
      const c = await getCampaignHistory(5);
      setCampaigns(c);
    } catch (err) {
      console.error("Failed to load campaign history:", err);
    } finally {
      setCampaignsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadChart();
    loadCampaigns();

    // Refresh stats every 30s
    statsRefreshRef.current = setInterval(loadStats, 30_000);
    // Refresh chart every 60s
    chartRefreshRef.current = setInterval(loadChart, 60_000);

    function onSmsStatusUpdated() {
      loadStats();
    }

    socket.on("sms:status_updated", onSmsStatusUpdated);

    return () => {
      socket.off("sms:status_updated", onSmsStatusUpdated);
      if (statsRefreshRef.current) clearInterval(statsRefreshRef.current);
      if (chartRefreshRef.current) clearInterval(chartRefreshRef.current);
    };
  }, [loadStats, loadChart, loadCampaigns]);

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border shrink-0">
        <h1 className="text-sm font-semibold text-foreground">Overview</h1>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Summary Stats */}
        <div className="px-5 pt-4 pb-3 border-b border-border/50">
          <SummaryStats stats={stats} loading={statsLoading} />
        </div>

        {/* Trend Chart */}
        <div className="border-b border-border/50" style={{ minHeight: 280 }}>
          <div className="px-5 py-2 border-b border-border/50">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Trend
            </span>
          </div>
          <div className="px-5 py-3">
            <TrendChart data7={data7} data30={data30} loading={chartLoading} />
          </div>
        </div>

        {/* Recent Campaigns */}
        <div className="border-b border-border/50">
          <div className="px-5 py-2 border-b border-border/50">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Recent Campaigns
            </span>
          </div>
          {campaignsLoading ? (
            <div className="px-5 py-4 text-xs text-muted-foreground">Loading campaigns...</div>
          ) : campaigns.length === 0 ? (
            <div className="px-5 py-4 text-xs text-muted-foreground">No campaigns yet.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 text-muted-foreground">
                  <th className="text-left px-5 py-2 font-medium">Campaign</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Template</th>
                  <th className="text-right px-3 py-2 font-medium">Total</th>
                  <th className="text-right px-3 py-2 font-medium">Delivered</th>
                  <th className="text-right px-3 py-2 font-medium">Failed</th>
                  <th className="text-right px-3 py-2 font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-border/30 hover:bg-accent/20">
                    <td className="px-5 py-2 font-medium text-foreground">{c.name}</td>
                    <td className="px-3 py-2">
                      <span className={`font-medium ${STATUS_COLORS[c.status] ?? "text-muted-foreground"}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{c.template.name}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{c.recipientCount}</td>
                    <td className="px-3 py-2 text-right text-green-400">{c.delivered}</td>
                    <td className="px-3 py-2 text-right text-red-400">{c.failed}</td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={
                          c.deliveryRate >= 90
                            ? "text-green-400"
                            : c.deliveryRate >= 70
                            ? "text-amber-400"
                            : "text-red-400"
                        }
                      >
                        {c.deliveryRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent messages */}
        <div className="overflow-auto">
          <div className="px-5 py-2 border-b border-border/50">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Recent Messages
            </span>
          </div>
          <RecentMessages />
        </div>
      </div>
    </div>
  );
}
