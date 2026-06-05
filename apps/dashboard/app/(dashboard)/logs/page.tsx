"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getCampaigns,
  getMessageLogs,
  type Campaign,
  type MessageLogsResponse,
  type MessageLogFilter,
} from "@/lib/api";
import { LogFilters } from "@/components/logs/log-filters";
import { MessageLogTable } from "@/components/logs/message-log-table";

const DEFAULT_LIMIT = 50;

export default function LogsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [logsData, setLogsData] = useState<MessageLogsResponse | null>(null);
  const [filters, setFilters] = useState<MessageLogFilter>({ page: 1, limit: DEFAULT_LIMIT });
  const [loading, setLoading] = useState(true);

  // Load campaigns once for the filter dropdown
  useEffect(() => {
    getCampaigns().then(setCampaigns).catch(console.error);
  }, []);

  const fetchLogs = useCallback(
    async (f: MessageLogFilter) => {
      setLoading(true);
      try {
        const data = await getMessageLogs(f);
        setLogsData(data);
      } catch (err) {
        console.error("Failed to fetch logs:", err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Fetch on filter change
  useEffect(() => {
    fetchLogs(filters);
  }, [filters, fetchLogs]);

  function handleFilterChange(newFilters: MessageLogFilter) {
    setFilters({ ...newFilters, limit: DEFAULT_LIMIT });
  }

  function handlePageChange(page: number) {
    setFilters((prev) => ({ ...prev, page }));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-foreground">Message Logs</h1>
            {logsData && !loading && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {logsData.total.toLocaleString()} message{logsData.total !== 1 ? "s" : ""} found
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-5 border-b border-border/50">
        <LogFilters campaigns={campaigns} filters={filters} onChange={handleFilterChange} />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-5">
        {loading ? (
          <div className="text-xs text-muted-foreground py-6">Loading messages...</div>
        ) : logsData ? (
          <MessageLogTable
            messages={logsData.messages}
            total={logsData.total}
            page={logsData.page}
            totalPages={logsData.totalPages}
            onPageChange={handlePageChange}
          />
        ) : (
          <div className="text-xs text-muted-foreground py-6">Failed to load messages.</div>
        )}
      </div>
    </div>
  );
}
