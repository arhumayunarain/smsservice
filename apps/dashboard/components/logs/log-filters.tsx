"use client";

import { useEffect, useRef, useState } from "react";
import { Campaign, MessageLogFilter, downloadMessageExport } from "@/lib/api";

interface LogFiltersProps {
  campaigns: Campaign[];
  filters: MessageLogFilter;
  onChange: (filters: MessageLogFilter) => void;
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "QUEUED", label: "Queued" },
  { value: "SENT_TO_DEVICE", label: "Sent to Device" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "FAILED", label: "Failed" },
];

export function LogFilters({ campaigns, filters, onChange }: LogFiltersProps) {
  const [phoneInput, setPhoneInput] = useState(filters.phone ?? "");
  const [exporting, setExporting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce phone search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (phoneInput !== (filters.phone ?? "")) {
        onChange({ ...filters, phone: phoneInput || undefined, page: 1 });
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneInput]);

  function handleClear() {
    setPhoneInput("");
    onChange({ page: 1, limit: filters.limit });
  }

  async function handleExport() {
    setExporting(true);
    try {
      await downloadMessageExport(filters);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 items-end py-3">
      {/* Campaign filter */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Campaign</label>
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          value={filters.campaignId ?? ""}
          onChange={(e) =>
            onChange({ ...filters, campaignId: e.target.value || undefined, page: 1 })
          }
        >
          <option value="">All Campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Status filter */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Status</label>
        <select
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          value={filters.status ?? ""}
          onChange={(e) =>
            onChange({ ...filters, status: e.target.value || undefined, page: 1 })
          }
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Date from */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Date From</label>
        <input
          type="date"
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          value={filters.dateFrom ?? ""}
          onChange={(e) =>
            onChange({ ...filters, dateFrom: e.target.value || undefined, page: 1 })
          }
        />
      </div>

      {/* Date to */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Date To</label>
        <input
          type="date"
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          value={filters.dateTo ?? ""}
          onChange={(e) =>
            onChange({ ...filters, dateTo: e.target.value || undefined, page: 1 })
          }
        />
      </div>

      {/* Phone search */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Phone</label>
        <input
          type="text"
          placeholder="Search phone..."
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-36"
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 items-end pb-0">
        <button
          onClick={handleClear}
          className="h-8 px-3 text-xs rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          Clear
        </button>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="h-8 px-3 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {exporting ? "Exporting..." : "Export CSV"}
        </button>
      </div>
    </div>
  );
}
