"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Package,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Settings,
} from "lucide-react";
import { ColumnMapping, MappingResult } from "./column-mapping";
import { ImportPreview } from "./import-preview";

interface PostexImportProps {
  templateId: string;
  templateVariables: string[];
  templateBody: string;
  onImportComplete: (
    recipients: Array<{ phoneNumber: string; variables: Record<string, string> }>
  ) => void;
  onReset: () => void;
}

type SubStep = "check" | "fetch" | "mapping" | "preview" | "done";

const ORDER_STATUSES = [
  { id: 0, label: "All Orders" },
  { id: 1, label: "Unbooked" },
  { id: 2, label: "Booked" },
  { id: 3, label: "PostEx Warehouse" },
  { id: 4, label: "Out For Delivery" },
  { id: 5, label: "Delivered" },
  { id: 6, label: "Returned" },
  { id: 7, label: "Un-Assigned By Me" },
  { id: 8, label: "Expired" },
  { id: 9, label: "Delivery Under Review" },
  { id: 15, label: "Picked By PostEx" },
  { id: 16, label: "Out For Return" },
  { id: 17, label: "Attempted" },
  { id: 18, label: "En-Route to PostEx Warehouse" },
] as const;

function getDefaultFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split("T")[0];
}

function getDefaultToDate(): string {
  return new Date().toISOString().split("T")[0];
}

interface MappingResultLocal {
  valid: boolean;
  recipients: Array<{ phoneNumber: string; variables: Record<string, string> }>;
  errors: Array<{ row: number; field: string; message: string }>;
  duplicates: Array<{ phoneNumber: string; rows: number[] }>;
}

function getApiUrl(): string {
  if (typeof window !== "undefined") return `${window.location.origin}/api`;
  return "/api";
}

function getAuthHeader(): Record<string, string> {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("sms_admin_token");
    if (stored) return { Authorization: `Bearer ${stored}` };
  }
  return {};
}

export function PostexImport({
  templateId,
  templateVariables,
  templateBody,
  onImportComplete,
  onReset,
}: PostexImportProps) {
  const [subStep, setSubStep] = useState<SubStep>("check");
  const [configured, setConfigured] = useState(false);
  const [configured2, setConfigured2] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(1);
  const [checkingStatus, setCheckingStatus] = useState(true);

  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [fetching, setFetching] = useState(false);

  // Filters
  const [orderStatusID, setOrderStatusID] = useState(0);
  const [fromDate, setFromDate] = useState(getDefaultFromDate);
  const [toDate, setToDate] = useState(getDefaultToDate);

  const [mappingResult, setMappingResult] = useState<MappingResultLocal | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setCheckingStatus(true);
    try {
      const res = await fetch(`${getApiUrl()}/postex/status`, {
        headers: getAuthHeader(),
      });
      if (res.ok) {
        const data = await res.json();
        setConfigured(data.configured);
        setConfigured2(data.configured2);
        if (data.configured || data.configured2) {
          if (!data.configured && data.configured2) setSelectedAccount(2);
          setSubStep("fetch");
        }
      }
    } catch {
      // Ignore
    } finally {
      setCheckingStatus(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  async function handleFetchOrders() {
    setFetching(true);
    setError(null);
    try {
      const res = await fetch(`${getApiUrl()}/postex/fetch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({ templateId, orderStatusID, fromDate, toDate, account: selectedAccount }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setImportJobId(data.importJobId);
      setHeaders(data.headers);
      setPreviewRows(data.previewRows ?? []);
      setTotalRows(data.totalRows);
      setSubStep("mapping");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch PostEx orders");
    } finally {
      setFetching(false);
    }
  }

  function handleMappingConfirm(
    _mapping: MappingResult,
    previewResult: MappingResultLocal
  ) {
    setMappingResult(previewResult);
    setSubStep("preview");
  }

  async function handleImportConfirm() {
    if (!mappingResult) return;
    setConfirming(true);
    setError(null);
    try {
      const recipients = mappingResult.recipients ?? [];
      setImportedCount(recipients.length);
      onImportComplete(recipients);
      setSubStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setConfirming(false);
    }
  }

  if (checkingStatus) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
        Checking PostEx configuration...
      </div>
    );
  }

  if (subStep === "done") {
    return (
      <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
        <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-green-400">
            {importedCount} order{importedCount !== 1 ? "s" : ""} imported from PostEx (snapshot)
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Data captured at import time — not live
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="p-1 text-muted-foreground hover:text-foreground rounded"
          title="Use different source"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Not configured */}
      {!configured && subStep === "check" && (
        <div className="rounded-lg border border-border p-6 text-center space-y-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mx-auto">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              PostEx API not configured
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Add your PostEx API token in Settings to import orders as recipients
            </p>
          </div>
          <a
            href="/settings"
            className="inline-flex items-center gap-2 px-4 py-2 border border-border text-muted-foreground rounded-md text-sm hover:text-foreground hover:bg-accent transition-colors"
          >
            <Settings className="h-4 w-4" />
            Go to Settings
          </a>
        </div>
      )}

      {/* Configured — fetch orders */}
      {(configured || configured2) && subStep === "fetch" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-400" />
              <span className="text-sm text-foreground font-medium">PostEx API configured</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Fetch orders from PostEx and import them as campaign recipients.
              This creates a snapshot — data is not live.
            </p>
          </div>

          {/* Account selector — only show if both are configured */}
          {configured && configured2 && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">PostEx Account</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedAccount(1)}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    selectedAccount === 1
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  Account 1
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAccount(2)}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    selectedAccount === 2
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  Account 2
                </button>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Order Status</label>
              <select
                value={orderStatusID}
                onChange={(e) => setOrderStatusID(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ORDER_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">From Date</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">To Date</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleFetchOrders}
            disabled={fetching}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {fetching ? (
              <>
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                Fetching orders...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Fetch Orders from PostEx
              </>
            )}
          </button>
        </div>
      )}

      {/* Column mapping */}
      {subStep === "mapping" && importJobId && headers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Package className="h-4 w-4" />
            <span>
              {totalRows} order{totalRows !== 1 ? "s" : ""} fetched from PostEx
            </span>
            <button
              type="button"
              onClick={() => setSubStep("fetch")}
              className="ml-auto text-xs underline hover:no-underline"
            >
              Re-fetch
            </button>
          </div>
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
            <p className="text-xs text-yellow-400">
              Snapshot taken at {new Date().toLocaleString()} — data is not live.
            </p>
          </div>
          <ColumnMapping
            headers={headers}
            templateVariables={templateVariables}
            importJobId={importJobId}
            templateId={templateId}
            onConfirm={handleMappingConfirm}
            strict={false}
          />
        </div>
      )}

      {/* Preview */}
      {subStep === "preview" && mappingResult && (
        <ImportPreview
          recipients={mappingResult.recipients}
          errors={mappingResult.errors}
          duplicates={mappingResult.duplicates}
          templateBody={templateBody}
          templateVariables={templateVariables}
          importedFileName="PostEx Orders (snapshot)"
          onConfirm={handleImportConfirm}
          onBack={() => setSubStep("mapping")}
          confirming={confirming}
          strict={false}
        />
      )}
    </div>
  );
}
