"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Link2,
  RefreshCw,
  X,
} from "lucide-react";
import { ColumnMapping, MappingResult } from "./column-mapping";
import { ImportPreview } from "./import-preview";

interface SheetsConnectProps {
  templateId: string;
  templateVariables: string[];
  templateBody: string;
  onImportComplete: (
    recipients: Array<{ phoneNumber: string; variables: Record<string, string> }>
  ) => void;
  onReset: () => void;
}

type SubStep = "check" | "url" | "tabs" | "mapping" | "preview" | "done";

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

function parseSpreadsheetId(url: string): string | null {
  // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export function SheetsConnect({
  templateId,
  templateVariables,
  templateBody,
  onImportComplete,
  onReset,
}: SheetsConnectProps) {
  const [subStep, setSubStep] = useState<SubStep>("check");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);

  const [sheetUrl, setSheetUrl] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const [tabs, setTabs] = useState<string[]>([]);
  const [selectedTab, setSelectedTab] = useState<string>("");
  const [loadingTabs, setLoadingTabs] = useState(false);

  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loadingData, setLoadingData] = useState(false);

  const [mappingResult, setMappingResult] = useState<MappingResultLocal | null>(null);
  const [phoneColumn, setPhoneColumn] = useState<string>("");
  const [variableMapping, setVariableMapping] = useState<Record<string, string>>({});

  const [confirming, setConfirming] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const checkGoogleStatus = useCallback(async () => {
    setCheckingStatus(true);
    try {
      const res = await fetch(`${getApiUrl()}/auth/google/status`, {
        headers: getAuthHeader(),
      });
      if (res.ok) {
        const data = await res.json();
        setGoogleConnected(data.connected);
        setGoogleEmail(data.email ?? null);
        if (data.connected) setSubStep("url");
      }
    } catch {
      // Ignore — show connect button
    } finally {
      setCheckingStatus(false);
    }
  }, []);

  useEffect(() => {
    checkGoogleStatus();
  }, [checkGoogleStatus]);

  function handleConnectGoogle() {
    // Redirect to backend OAuth initiation; backend @Public() guard allows this
    const apiUrl = getApiUrl();
    window.location.href = `${apiUrl}/auth/google`;
  }

  function handleUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSheetUrl(val);
    setUrlError(null);

    if (!val) {
      setSpreadsheetId(null);
      return;
    }
    const id = parseSpreadsheetId(val);
    if (id) {
      setSpreadsheetId(id);
    } else {
      // Could be a direct ID
      const trimmed = val.trim();
      if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
        setSpreadsheetId(trimmed);
      } else {
        setSpreadsheetId(null);
      }
    }
  }

  async function handleLoadTabs() {
    if (!spreadsheetId) {
      setUrlError("Enter a valid Google Sheets URL or spreadsheet ID.");
      return;
    }
    setLoadingTabs(true);
    setError(null);
    try {
      const res = await fetch(`${getApiUrl()}/sheets/${spreadsheetId}/tabs`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setTabs(data.tabs ?? []);
      setSelectedTab(data.tabs?.[0] ?? "");
      setSubStep("tabs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tabs");
    } finally {
      setLoadingTabs(false);
    }
  }

  async function handleLoadData() {
    if (!spreadsheetId || !selectedTab) return;
    setLoadingData(true);
    setError(null);
    try {
      const res = await fetch(`${getApiUrl()}/sheets/${spreadsheetId}/data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({ sheetName: selectedTab, templateId }),
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
      setError(err instanceof Error ? err.message : "Failed to load sheet data");
    } finally {
      setLoadingData(false);
    }
  }

  function handleMappingConfirm(
    mapping: MappingResult,
    previewResult: MappingResultLocal
  ) {
    setPhoneColumn(mapping.phoneColumn);
    setVariableMapping(mapping.variableMapping);
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
        Checking Google connection...
      </div>
    );
  }

  if (subStep === "done") {
    return (
      <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
        <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-green-400">
            {importedCount} recipient{importedCount !== 1 ? "s" : ""} imported from Google Sheets
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tab: {selectedTab}
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

      {/* Step: Not connected */}
      {!googleConnected && subStep === "check" && (
        <div className="rounded-lg border border-border p-6 text-center space-y-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mx-auto">
            <Link2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Connect your Google Account
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Grant read-only access to Google Sheets to import recipients
            </p>
          </div>
          <button
            type="button"
            onClick={handleConnectGoogle}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Connect Google Account
          </button>
        </div>
      )}

      {/* Step: Connected — URL entry */}
      {googleConnected && (subStep === "url" || subStep === "tabs") && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            Connected as {googleEmail ?? "Google account"}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Spreadsheet URL
            </label>
            <input
              type="text"
              value={sheetUrl}
              onChange={handleUrlChange}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {urlError && (
              <p className="text-xs text-destructive">{urlError}</p>
            )}
            {spreadsheetId && (
              <p className="text-xs text-muted-foreground">
                Spreadsheet ID: <span className="font-mono">{spreadsheetId}</span>
              </p>
            )}
          </div>

          {subStep === "url" && (
            <button
              type="button"
              onClick={handleLoadTabs}
              disabled={!spreadsheetId || loadingTabs}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingTabs ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4" />
                  Load Sheet Tabs
                </>
              )}
            </button>
          )}

          {/* Tab picker */}
          {subStep === "tabs" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  Select Tab
                </label>
                <select
                  value={selectedTab}
                  onChange={(e) => setSelectedTab(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {tabs.map((tab) => (
                    <option key={tab} value={tab}>
                      {tab}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSubStep("url")}
                  className="px-3 py-2 border border-border text-muted-foreground rounded-md text-sm hover:text-foreground hover:bg-accent transition-colors"
                >
                  Change URL
                </button>
                <button
                  type="button"
                  onClick={handleLoadData}
                  disabled={!selectedTab || loadingData}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingData ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                      Loading data...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Import from Tab
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step: Column mapping */}
      {subStep === "mapping" && importJobId && headers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
              {selectedTab}
            </span>
            <span>
              — {totalRows} rows, {headers.length} columns
            </span>
            <button
              type="button"
              onClick={() => setSubStep("tabs")}
              className="ml-auto text-xs underline hover:no-underline"
            >
              Change tab
            </button>
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

      {/* Step: Preview */}
      {subStep === "preview" && mappingResult && (
        <ImportPreview
          recipients={mappingResult.recipients}
          errors={mappingResult.errors}
          duplicates={mappingResult.duplicates}
          templateBody={templateBody}
          templateVariables={templateVariables}
          importedFileName={`${selectedTab} (Google Sheets)`}
          onConfirm={handleImportConfirm}
          onBack={() => setSubStep("mapping")}
          confirming={confirming}
          strict={false}
        />
      )}
    </div>
  );
}
