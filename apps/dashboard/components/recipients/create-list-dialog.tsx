"use client";

import { useState } from "react";
import {
  X,
  Package,
  FileSpreadsheet,
  Link2,
  Type,
  CheckCircle2,
  Plus,
  Trash2,
  ChevronDown,
  AlertCircle,
  Settings,
  ExternalLink,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import { FileUpload, type UploadResult } from "@/components/import/file-upload";
import { ColumnMapping } from "@/components/import/column-mapping";
import { getToken } from "@/lib/auth";

interface CreateListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

type SourceType = "POSTEX" | "POSTEX2" | "LEOPARDS" | "LEOPARDS2" | "CSV" | "SHEETS" | "MANUAL";
type Step = "name-source" | "import" | "done";

// PostEx sub-steps
type PostexSubStep = "check" | "fetch" | "phone-select" | "confirm";
// Leopards sub-steps
type LeopardsSubStep = "check" | "fetch" | "phone-select" | "confirm";
// Sheets sub-steps
type SheetsSubStep = "check" | "url" | "tabs" | "phone-select" | "confirm";
// CSV sub-steps
type CsvSubStep = "upload" | "mapping" | "confirm";

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

function parseSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function mapRowsToRecipients(
  rows: Record<string, string>[],
  phoneColumn: string
): Array<{ phoneNumber: string; variables: Record<string, string> }> {
  return rows
    .map((row) => {
      const phoneNumber = row[phoneColumn] ?? "";
      if (!phoneNumber) return null;
      const variables: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key !== phoneColumn && value) {
          variables[key] = value;
        }
      }
      return { phoneNumber, variables };
    })
    .filter(Boolean) as Array<{
    phoneNumber: string;
    variables: Record<string, string>;
  }>;
}

function getApiUrl(): string {
  if (typeof window !== "undefined") return `${window.location.origin}/api`;
  return "/api";
}

function getAuthHeader(): Record<string, string> {
  const token = getToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

export function CreateListDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateListDialogProps) {
  const [step, setStep] = useState<Step>("name-source");
  const [listName, setListName] = useState("");
  const [source, setSource] = useState<SourceType | null>(null);
  const [listId, setListId] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // PostEx state
  const [postexSubStep, setPostexSubStep] = useState<PostexSubStep>("check");
  const [postexConfigured, setPostexConfigured] = useState(false);
  const [postexCheckingStatus, setPostexCheckingStatus] = useState(false);
  const [postexOrderStatusID, setPostexOrderStatusID] = useState(0);
  const [postexFromDate, setPostexFromDate] = useState(getDefaultFromDate());
  const [postexToDate, setPostexToDate] = useState(getDefaultToDate());
  const [postexFetching, setPostexFetching] = useState(false);
  const [postexImportJobId, setPostexImportJobId] = useState<string | null>(null);
  const [postexHeaders, setPostexHeaders] = useState<string[]>([]);
  const [postexRows, setPostexRows] = useState<Record<string, string>[]>([]);
  const [postexTotalRows, setPostexTotalRows] = useState(0);
  const [postexPhoneColumn, setPostexPhoneColumn] = useState("");
  const [postexConfirming, setPostexConfirming] = useState(false);

  // Leopards state
  const [leopardsSubStep, setLeopardsSubStep] = useState<LeopardsSubStep>("check");
  const [leopardsConfigured, setLeopardsConfigured] = useState(false);
  const [leopardsCheckingStatus, setLeopardsCheckingStatus] = useState(false);
  const [leopardsFromDate, setLeopardsFromDate] = useState(getDefaultFromDate());
  const [leopardsToDate, setLeopardsToDate] = useState(getDefaultToDate());
  const [leopardsFetching, setLeopardsFetching] = useState(false);
  const [leopardsImportJobId, setLeopardsImportJobId] = useState<string | null>(null);
  const [leopardsHeaders, setLeopardsHeaders] = useState<string[]>([]);
  const [leopardsRows, setLeopardsRows] = useState<Record<string, string>[]>([]);
  const [leopardsTotalRows, setLeopardsTotalRows] = useState(0);
  const [leopardsPhoneColumn, setLeopardsPhoneColumn] = useState("");
  const [leopardsConfirming, setLeopardsConfirming] = useState(false);

  // Sheets state
  const [sheetsSubStep, setSheetsSubStep] = useState<SheetsSubStep>("check");
  const [sheetsGoogleConnected, setSheetsGoogleConnected] = useState(false);
  const [sheetsGoogleEmail, setSheetsGoogleEmail] = useState<string | null>(null);
  const [sheetsCheckingStatus, setSheetsCheckingStatus] = useState(false);
  const [sheetsUrl, setSheetsUrl] = useState("");
  const [sheetsSpreadsheetId, setSheetsSpreadsheetId] = useState<string | null>(null);
  const [sheetsUrlError, setSheetsUrlError] = useState<string | null>(null);
  const [sheetsTabs, setSheetsTabs] = useState<string[]>([]);
  const [sheetsSelectedTab, setSheetsSelectedTab] = useState("");
  const [sheetsLoadingTabs, setSheetsLoadingTabs] = useState(false);
  const [sheetsHeaders, setSheetsHeaders] = useState<string[]>([]);
  const [sheetsRows, setSheetsRows] = useState<Record<string, string>[]>([]);
  const [sheetsTotalRows, setSheetsTotalRows] = useState(0);
  const [sheetsLoadingData, setSheetsLoadingData] = useState(false);
  const [sheetsPhoneColumn, setSheetsPhoneColumn] = useState("");
  const [sheetsImportJobId, setSheetsImportJobId] = useState<string | null>(null);
  const [sheetsConfirming, setSheetsConfirming] = useState(false);

  // CSV state
  const [csvSubStep, setCsvSubStep] = useState<CsvSubStep>("upload");
  const [csvUploadResult, setCsvUploadResult] = useState<UploadResult | null>(null);
  const [csvRecipients, setCsvRecipients] = useState<Array<{ phoneNumber: string; variables: Record<string, string> }>>([]);
  const [csvConfirming, setCsvConfirming] = useState(false);

  // Manual state
  const [manualPhone, setManualPhone] = useState("");
  const [manualPhones, setManualPhones] = useState<string[]>([]);
  const [manualSubmitting, setManualSubmitting] = useState(false);

  function resetDialog() {
    setStep("name-source");
    setListName("");
    setSource(null);
    setListId(null);
    setCreatedCount(0);
    setError(null);
    setCreating(false);

    // Reset PostEx
    setPostexSubStep("check");
    setPostexConfigured(false);
    setPostexCheckingStatus(false);
    setPostexOrderStatusID(0);
    setPostexFromDate(getDefaultFromDate());
    setPostexToDate(getDefaultToDate());
    setPostexFetching(false);
    setPostexImportJobId(null);
    setPostexHeaders([]);
    setPostexRows([]);
    setPostexTotalRows(0);
    setPostexPhoneColumn("");
    setPostexConfirming(false);

    // Reset Leopards
    setLeopardsSubStep("check");
    setLeopardsConfigured(false);
    setLeopardsCheckingStatus(false);
    setLeopardsFromDate(getDefaultFromDate());
    setLeopardsToDate(getDefaultToDate());
    setLeopardsFetching(false);
    setLeopardsImportJobId(null);
    setLeopardsHeaders([]);
    setLeopardsRows([]);
    setLeopardsTotalRows(0);
    setLeopardsPhoneColumn("");
    setLeopardsConfirming(false);

    // Reset Sheets
    setSheetsSubStep("check");
    setSheetsGoogleConnected(false);
    setSheetsGoogleEmail(null);
    setSheetsCheckingStatus(false);
    setSheetsUrl("");
    setSheetsSpreadsheetId(null);
    setSheetsUrlError(null);
    setSheetsTabs([]);
    setSheetsSelectedTab("");
    setSheetsLoadingTabs(false);
    setSheetsHeaders([]);
    setSheetsRows([]);
    setSheetsTotalRows(0);
    setSheetsLoadingData(false);
    setSheetsPhoneColumn("");
    setSheetsImportJobId(null);
    setSheetsConfirming(false);

    // Reset CSV
    setCsvSubStep("upload");
    setCsvUploadResult(null);
    setCsvRecipients([]);
    setCsvConfirming(false);

    // Reset Manual
    setManualPhone("");
    setManualPhones([]);
    setManualSubmitting(false);
  }

  function handleClose() {
    resetDialog();
    onOpenChange(false);
  }

  // ── Step 1: Name & Source ──────────────────────────────────────────────────

  async function handleCreateList() {
    if (!listName.trim() || !source) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${getApiUrl()}/recipient-lists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          name: listName.trim(),
          source:
            source === "POSTEX2" ? "POSTEX" :
            source === "LEOPARDS2" ? "LEOPARDS" :
            source,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setListId(data.id);
      setStep("import");

      // If PostEx, start status check immediately
      if (source === "POSTEX" || source === "POSTEX2") {
        checkPostexStatus();
      } else if (source === "LEOPARDS" || source === "LEOPARDS2") {
        checkLeopardsStatus();
      } else if (source === "SHEETS") {
        checkSheetsStatus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create list");
    } finally {
      setCreating(false);
    }
  }

  // ── PostEx flow ─────────────────────────────────────────────────────────────

  async function checkPostexStatus() {
    setPostexCheckingStatus(true);
    try {
      const res = await fetch(`${getApiUrl()}/postex/status`, {
        headers: getAuthHeader(),
      });
      if (res.ok) {
        const data = await res.json();
        const isConfigured = source === "POSTEX2" ? data.configured2 : data.configured;
        setPostexConfigured(isConfigured);
        if (isConfigured) setPostexSubStep("fetch");
        else setPostexSubStep("check");
      }
    } catch {
      setPostexSubStep("check");
    } finally {
      setPostexCheckingStatus(false);
    }
  }

  async function handlePostexFetch() {
    setPostexFetching(true);
    setError(null);
    try {
      const res = await fetch(`${getApiUrl()}/postex/fetch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          orderStatusID: postexOrderStatusID,
          fromDate: postexFromDate,
          toDate: postexToDate,
          account: source === "POSTEX2" ? 2 : 1,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPostexImportJobId(data.importJobId ?? null);
      setPostexHeaders(data.headers ?? []);
      setPostexRows(data.previewRows ?? []);
      setPostexTotalRows(data.totalRows ?? 0);
      // Auto-detect phone column
      const phoneCol = (data.headers as string[]).find((h: string) =>
        ["phone", "phone_number", "mobile", "contact", "number", "tel", "cell", "phonenumber", "mobile_number", "msisdn", "consigneePhoneNumber"].some(
          (p) => h.toLowerCase().includes(p)
        )
      );
      setPostexPhoneColumn(phoneCol ?? "");
      setPostexSubStep("phone-select");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch PostEx orders");
    } finally {
      setPostexFetching(false);
    }
  }

  async function handlePostexConfirm() {
    if (!listId || !postexPhoneColumn || !postexImportJobId) return;
    setPostexConfirming(true);
    setError(null);
    try {
      // Build variable mapping: all non-phone columns map to themselves
      const variableMapping: Record<string, string> = {};
      for (const h of postexHeaders) {
        if (h !== postexPhoneColumn) {
          variableMapping[h] = h;
        }
      }

      // Step 1: Validate & map ALL rows from ImportJob (not just preview)
      const mapRes = await fetch(`${getApiUrl()}/recipient-lists/${listId}/import/map`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          importJobId: postexImportJobId,
          phoneColumn: postexPhoneColumn,
          variableMapping,
        }),
      });
      if (!mapRes.ok) {
        const text = await mapRes.text();
        throw new Error(text || `HTTP ${mapRes.status}`);
      }

      // Step 2: Confirm — write validated entries to recipient list
      const confirmRes = await fetch(`${getApiUrl()}/recipient-lists/${listId}/import/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({ importJobId: postexImportJobId }),
      });
      if (!confirmRes.ok) {
        const text = await confirmRes.text();
        throw new Error(text || `HTTP ${confirmRes.status}`);
      }
      const data = await confirmRes.json();
      setCreatedCount(data.entryCount ?? postexTotalRows);
      setStep("done");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import PostEx orders");
    } finally {
      setPostexConfirming(false);
    }
  }

  // ── Leopards flow ───────────────────────────────────────────────────────────

  async function checkLeopardsStatus() {
    setLeopardsCheckingStatus(true);
    try {
      const res = await fetch(`${getApiUrl()}/leopards/status`, {
        headers: getAuthHeader(),
      });
      if (res.ok) {
        const data = await res.json();
        const isConfigured = source === "LEOPARDS2" ? !!data.configured2 : !!data.configured;
        setLeopardsConfigured(isConfigured);
        if (isConfigured) setLeopardsSubStep("fetch");
        else setLeopardsSubStep("check");
      }
    } catch {
      setLeopardsSubStep("check");
    } finally {
      setLeopardsCheckingStatus(false);
    }
  }

  async function handleLeopardsFetch() {
    setLeopardsFetching(true);
    setError(null);
    try {
      const res = await fetch(`${getApiUrl()}/leopards/fetch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          fromDate: leopardsFromDate,
          toDate: leopardsToDate,
          account: source === "LEOPARDS2" ? 2 : 1,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setLeopardsImportJobId(data.importJobId ?? null);
      setLeopardsHeaders(data.headers ?? []);
      setLeopardsRows(data.previewRows ?? []);
      setLeopardsTotalRows(data.totalRows ?? 0);
      // Auto-detect phone column — Leopards uses consignment_phone
      const phoneCol = (data.headers as string[]).find((h: string) =>
        ["consignment_phone", "phone", "phone_number", "mobile", "contact", "number", "tel", "cell", "msisdn"].some(
          (p) => h.toLowerCase().includes(p)
        )
      );
      setLeopardsPhoneColumn(phoneCol ?? "");
      setLeopardsSubStep("phone-select");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch Leopards packets");
    } finally {
      setLeopardsFetching(false);
    }
  }

  async function handleLeopardsConfirm() {
    if (!listId || !leopardsPhoneColumn || !leopardsImportJobId) return;
    setLeopardsConfirming(true);
    setError(null);
    try {
      const variableMapping: Record<string, string> = {};
      for (const h of leopardsHeaders) {
        if (h !== leopardsPhoneColumn) variableMapping[h] = h;
      }

      const mapRes = await fetch(`${getApiUrl()}/recipient-lists/${listId}/import/map`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          importJobId: leopardsImportJobId,
          phoneColumn: leopardsPhoneColumn,
          variableMapping,
        }),
      });
      if (!mapRes.ok) {
        const text = await mapRes.text();
        throw new Error(text || `HTTP ${mapRes.status}`);
      }

      const confirmRes = await fetch(`${getApiUrl()}/recipient-lists/${listId}/import/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({ importJobId: leopardsImportJobId }),
      });
      if (!confirmRes.ok) {
        const text = await confirmRes.text();
        throw new Error(text || `HTTP ${confirmRes.status}`);
      }
      const data = await confirmRes.json();
      setCreatedCount(data.entryCount ?? leopardsTotalRows);
      setStep("done");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import Leopards packets");
    } finally {
      setLeopardsConfirming(false);
    }
  }

  // ── Google Sheets flow ──────────────────────────────────────────────────────

  async function checkSheetsStatus() {
    setSheetsCheckingStatus(true);
    try {
      const res = await fetch(`${getApiUrl()}/auth/google/status`, {
        headers: getAuthHeader(),
      });
      if (res.ok) {
        const data = await res.json();
        setSheetsGoogleConnected(data.connected);
        setSheetsGoogleEmail(data.email ?? null);
        if (data.connected) setSheetsSubStep("url");
        else setSheetsSubStep("check");
      }
    } catch {
      setSheetsSubStep("check");
    } finally {
      setSheetsCheckingStatus(false);
    }
  }

  function handleSheetsUrlChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSheetsUrl(val);
    setSheetsUrlError(null);
    if (!val) {
      setSheetsSpreadsheetId(null);
      return;
    }
    const id = parseSpreadsheetId(val);
    if (id) {
      setSheetsSpreadsheetId(id);
    } else {
      const trimmed = val.trim();
      if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
        setSheetsSpreadsheetId(trimmed);
      } else {
        setSheetsSpreadsheetId(null);
      }
    }
  }

  async function handleLoadSheetsTabs() {
    if (!sheetsSpreadsheetId) {
      setSheetsUrlError("Enter a valid Google Sheets URL or spreadsheet ID.");
      return;
    }
    setSheetsLoadingTabs(true);
    setError(null);
    try {
      const res = await fetch(`${getApiUrl()}/sheets/${sheetsSpreadsheetId}/tabs`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSheetsTabs(data.tabs ?? []);
      setSheetsSelectedTab(data.tabs?.[0] ?? "");
      setSheetsSubStep("tabs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sheet tabs");
    } finally {
      setSheetsLoadingTabs(false);
    }
  }

  async function handleLoadSheetsData() {
    if (!sheetsSpreadsheetId || !sheetsSelectedTab) return;
    setSheetsLoadingData(true);
    setError(null);
    try {
      const res = await fetch(`${getApiUrl()}/sheets/${sheetsSpreadsheetId}/data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({ sheetName: sheetsSelectedTab }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSheetsImportJobId(data.importJobId ?? null);
      setSheetsHeaders(data.headers ?? []);
      setSheetsRows(data.previewRows ?? []);
      setSheetsTotalRows(data.totalRows ?? 0);
      // Auto-detect phone column
      const phoneCol = (data.headers as string[]).find((h: string) =>
        ["phone", "phone_number", "mobile", "contact", "number", "tel", "cell", "phonenumber", "mobile_number", "msisdn"].some(
          (p) => h.toLowerCase().includes(p)
        )
      );
      setSheetsPhoneColumn(phoneCol ?? "");
      setSheetsSubStep("phone-select");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sheet data");
    } finally {
      setSheetsLoadingData(false);
    }
  }

  async function handleSheetsConfirm() {
    if (!listId || !sheetsPhoneColumn) return;
    setSheetsConfirming(true);
    setError(null);
    try {
      const rows = mapRowsToRecipients(sheetsRows, sheetsPhoneColumn);
      const res = await fetch(`${getApiUrl()}/recipient-lists/${listId}/import/sheets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCreatedCount(data.entryCount ?? rows.length);
      setStep("done");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import from Google Sheets");
    } finally {
      setSheetsConfirming(false);
    }
  }

  // ── CSV/Excel flow ──────────────────────────────────────────────────────────

  function handleCsvUpload(result: UploadResult) {
    setCsvUploadResult(result);
    setCsvSubStep("mapping");
  }

  async function handleCsvMappingConfirm(
    _mapping: { phoneColumn: string; variableMapping: Record<string, string> },
    previewResult: {
      valid: boolean;
      recipients: Array<{ phoneNumber: string; variables: Record<string, string> }>;
    }
  ) {
    setCsvRecipients(previewResult.recipients);
    setCsvSubStep("confirm");
  }

  async function handleCsvConfirm() {
    if (!listId || !csvUploadResult) return;
    setCsvConfirming(true);
    setError(null);
    try {
      const res = await fetch(
        `${getApiUrl()}/recipient-lists/${listId}/import/confirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader(),
          },
          body: JSON.stringify({ importJobId: csvUploadResult.importJobId }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCreatedCount(data.entryCount ?? csvRecipients.length);
      setStep("done");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm import");
    } finally {
      setCsvConfirming(false);
    }
  }

  // ── Manual entry flow ───────────────────────────────────────────────────────

  function handleAddManualPhone() {
    const phone = manualPhone.trim();
    if (!phone || manualPhones.includes(phone)) return;
    setManualPhones((prev) => [...prev, phone]);
    setManualPhone("");
  }

  async function handleManualConfirm() {
    if (!listId || manualPhones.length === 0) return;
    setManualSubmitting(true);
    setError(null);
    try {
      // Batch via postex endpoint for efficiency
      const orders = manualPhones.map((phone) => ({
        phoneNumber: phone,
        variables: {},
      }));
      const res = await fetch(
        `${getApiUrl()}/recipient-lists/${listId}/import/postex`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader(),
          },
          body: JSON.stringify({ orders }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCreatedCount(data.entryCount ?? manualPhones.length);
      setStep("done");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save recipients");
    } finally {
      setManualSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold text-foreground">
            {step === "name-source" && "Create Recipient List"}
            {step === "import" && (
              <span>
                Import to &quot;<span className="text-primary">{listName}</span>&quot;
              </span>
            )}
            {step === "done" && "List Created"}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* ── Step 1: Name & Source ── */}
          {step === "name-source" && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-foreground">
                  List Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && source && handleCreateList()}
                  placeholder="e.g. PostEx Delivered — Feb 2026"
                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  Import Source <span className="text-destructive">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: "POSTEX" as SourceType, icon: Package, label: "PostEx Account 1" },
                      { value: "POSTEX2" as SourceType, icon: Package, label: "PostEx Account 2" },
                      { value: "LEOPARDS" as SourceType, icon: Package, label: "Leopards Account 1" },
                      { value: "LEOPARDS2" as SourceType, icon: Package, label: "Leopards Account 2" },
                      { value: "CSV" as SourceType, icon: FileSpreadsheet, label: "CSV / Excel" },
                      { value: "SHEETS" as SourceType, icon: Link2, label: "Google Sheets" },
                      { value: "MANUAL" as SourceType, icon: Type, label: "Manual Entry" },
                    ] as const
                  ).map(({ value, icon: Icon, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSource(value)}
                      className={`flex items-center gap-2.5 px-4 py-3 rounded-md border text-sm font-medium transition-colors text-left ${
                        source === value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Import (source-specific) ── */}
          {step === "import" && (source === "POSTEX" || source === "POSTEX2") && (
            <div className="space-y-4">
              {postexCheckingStatus ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                  Checking PostEx configuration...
                </div>
              ) : postexSubStep === "check" && !postexConfigured ? (
                <div className="rounded-lg border border-border p-6 text-center space-y-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mx-auto">
                    <Package className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">PostEx API not configured</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Add your PostEx API token in Settings to import orders
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
              ) : postexSubStep === "fetch" ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Order Status</label>
                      <div className="relative">
                        <select
                          value={postexOrderStatusID}
                          onChange={(e) => setPostexOrderStatusID(Number(e.target.value))}
                          className="w-full appearance-none px-2.5 py-1.5 pr-7 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {ORDER_STATUSES.map((s) => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">From Date</label>
                      <input
                        type="date"
                        value={postexFromDate}
                        onChange={(e) => setPostexFromDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">To Date</label>
                      <input
                        type="date"
                        value={postexToDate}
                        onChange={(e) => setPostexToDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handlePostexFetch}
                    disabled={postexFetching}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {postexFetching ? (
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
              ) : postexSubStep === "phone-select" ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Package className="h-4 w-4" />
                    <span>{postexTotalRows} orders fetched</span>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">
                      Select Phone Number Column <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={postexPhoneColumn}
                        onChange={(e) => setPostexPhoneColumn(e.target.value)}
                        className="w-full appearance-none px-3 py-2 pr-8 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">Select column...</option>
                        {postexHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      All other columns will be stored as variables on each recipient.
                    </p>
                  </div>
                  {postexRows.length > 0 && (
                    <div className="rounded-md border border-border overflow-hidden">
                      <div className="px-3 py-2 bg-muted/30 border-b border-border text-xs text-muted-foreground">
                        Preview (first {Math.min(postexRows.length, 5)} rows)
                      </div>
                      <div className="divide-y divide-border max-h-40 overflow-y-auto">
                        {postexRows.slice(0, 5).map((row, i) => (
                          <div key={i} className="px-3 py-2 text-xs text-muted-foreground font-mono">
                            {postexPhoneColumn ? row[postexPhoneColumn] || "(empty)" : Object.values(row).slice(0, 3).join(" | ")}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {step === "import" && (source === "LEOPARDS" || source === "LEOPARDS2") && (
            <div className="space-y-4">
              {leopardsCheckingStatus ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                  Checking Leopards configuration...
                </div>
              ) : leopardsSubStep === "check" && !leopardsConfigured ? (
                <div className="rounded-lg border border-border p-6 text-center space-y-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mx-auto">
                    <Package className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Leopards API not configured</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Set LEOPARDS_KEY and LEOPARDS_KEY_PASSWORD in the backend .env to enable Leopards imports.
                    </p>
                  </div>
                </div>
              ) : leopardsSubStep === "fetch" ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">From Date</label>
                      <input
                        type="date"
                        value={leopardsFromDate}
                        onChange={(e) => setLeopardsFromDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">To Date</label>
                      <input
                        type="date"
                        value={leopardsToDate}
                        onChange={(e) => setLeopardsToDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleLeopardsFetch}
                    disabled={leopardsFetching}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {leopardsFetching ? (
                      <>
                        <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                        Fetching packets...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4" />
                        Fetch Packets from Leopards
                      </>
                    )}
                  </button>
                </div>
              ) : leopardsSubStep === "phone-select" ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Package className="h-4 w-4" />
                    <span>{leopardsTotalRows} packets fetched</span>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">
                      Select Phone Number Column <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={leopardsPhoneColumn}
                        onChange={(e) => setLeopardsPhoneColumn(e.target.value)}
                        className="w-full appearance-none px-3 py-2 pr-8 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">Select column...</option>
                        {leopardsHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      All other columns will be stored as variables on each recipient.
                    </p>
                  </div>
                  {leopardsRows.length > 0 && (
                    <div className="rounded-md border border-border overflow-hidden">
                      <div className="px-3 py-2 bg-muted/30 border-b border-border text-xs text-muted-foreground">
                        Preview (first {Math.min(leopardsRows.length, 5)} rows)
                      </div>
                      <div className="divide-y divide-border max-h-40 overflow-y-auto">
                        {leopardsRows.slice(0, 5).map((row, i) => (
                          <div key={i} className="px-3 py-2 text-xs text-muted-foreground font-mono">
                            {leopardsPhoneColumn ? row[leopardsPhoneColumn] || "(empty)" : Object.values(row).slice(0, 3).join(" | ")}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {step === "import" && source === "SHEETS" && (
            <div className="space-y-4">
              {sheetsCheckingStatus ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                  Checking Google connection...
                </div>
              ) : sheetsSubStep === "check" && !sheetsGoogleConnected ? (
                <div className="rounded-lg border border-border p-6 text-center space-y-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mx-auto">
                    <Link2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Connect your Google Account</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Grant read-only access to Google Sheets to import recipients
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { window.location.href = `${getApiUrl()}/auth/google`; }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Connect Google Account
                  </button>
                </div>
              ) : (sheetsSubStep === "url" || sheetsSubStep === "tabs") ? (
                <div className="space-y-4">
                  {sheetsGoogleConnected && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                      Connected as {sheetsGoogleEmail ?? "Google account"}
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">Spreadsheet URL</label>
                    <input
                      type="text"
                      value={sheetsUrl}
                      onChange={handleSheetsUrlChange}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {sheetsUrlError && <p className="text-xs text-destructive">{sheetsUrlError}</p>}
                    {sheetsSpreadsheetId && (
                      <p className="text-xs text-muted-foreground">
                        ID: <span className="font-mono">{sheetsSpreadsheetId}</span>
                      </p>
                    )}
                  </div>

                  {sheetsSubStep === "url" && (
                    <button
                      type="button"
                      onClick={handleLoadSheetsTabs}
                      disabled={!sheetsSpreadsheetId || sheetsLoadingTabs}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {sheetsLoadingTabs ? (
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

                  {sheetsSubStep === "tabs" && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-foreground">Select Tab</label>
                        <select
                          value={sheetsSelectedTab}
                          onChange={(e) => setSheetsSelectedTab(e.target.value)}
                          className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {sheetsTabs.map((tab) => (
                            <option key={tab} value={tab}>{tab}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSheetsSubStep("url")}
                          className="px-3 py-2 border border-border text-muted-foreground rounded-md text-sm hover:text-foreground hover:bg-accent transition-colors"
                        >
                          Change URL
                        </button>
                        <button
                          type="button"
                          onClick={handleLoadSheetsData}
                          disabled={!sheetsSelectedTab || sheetsLoadingData}
                          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {sheetsLoadingData ? (
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
              ) : sheetsSubStep === "phone-select" ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{sheetsSelectedTab}</span>
                    <span>— {sheetsTotalRows} rows, {sheetsHeaders.length} columns</span>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-foreground">
                      Select Phone Number Column <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={sheetsPhoneColumn}
                        onChange={(e) => setSheetsPhoneColumn(e.target.value)}
                        className="w-full appearance-none px-3 py-2 pr-8 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">Select column...</option>
                        {sheetsHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      All other columns will be stored as variables on each recipient.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {step === "import" && source === "CSV" && (
            <div className="space-y-4">
              {csvSubStep === "upload" && (
                <FileUpload
                  onUpload={handleCsvUpload}
                  apiBaseUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/api`}
                />
              )}

              {csvSubStep === "mapping" && csvUploadResult && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>{csvUploadResult.fileName} — {csvUploadResult.totalRows} rows</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCsvUploadResult(null);
                        setCsvSubStep("upload");
                      }}
                      className="ml-auto text-xs underline hover:no-underline"
                    >
                      Change file
                    </button>
                  </div>
                  <ColumnMapping
                    headers={csvUploadResult.headers}
                    templateVariables={[]}
                    importJobId={csvUploadResult.importJobId}
                    onConfirm={handleCsvMappingConfirm}
                    strict={false}
                    mapEndpoint={`/recipient-lists/${listId}/import/map`}
                  />
                </div>
              )}

              {csvSubStep === "confirm" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-400">
                        {csvRecipients.length} valid recipient{csvRecipients.length !== 1 ? "s" : ""} ready to import
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        From {csvUploadResult?.fileName}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === "import" && source === "MANUAL" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">
                  Add Phone Numbers
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddManualPhone();
                      }
                    }}
                    placeholder="e.g. 03001234567"
                    className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={handleAddManualPhone}
                    disabled={!manualPhone.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Press Enter or click Add to add each number</p>
              </div>

              {manualPhones.length > 0 && (
                <div className="rounded-md border border-border overflow-hidden">
                  <div className="px-3 py-2 bg-muted/30 border-b border-border text-xs text-muted-foreground">
                    {manualPhones.length} phone number{manualPhones.length !== 1 ? "s" : ""} added
                  </div>
                  <div className="divide-y divide-border max-h-48 overflow-y-auto">
                    {manualPhones.map((phone, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm font-mono text-foreground">{phone}</span>
                        <button
                          type="button"
                          onClick={() => setManualPhones((prev) => prev.filter((_, idx) => idx !== i))}
                          className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Done ── */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-500/10">
                <CheckCircle2 className="h-7 w-7 text-green-400" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">
                  List created successfully
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  &quot;{listName}&quot; with {createdCount.toLocaleString()} recipient
                  {createdCount !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between">
          <div>
            {step === "import" && (
              <button
                type="button"
                onClick={() => setStep("name-source")}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
            )}
          </div>

          <div className="flex gap-3">
            {step !== "done" && (
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            )}

            {step === "name-source" && (
              <button
                type="button"
                onClick={handleCreateList}
                disabled={!listName.trim() || !source || creating}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {creating ? "Creating..." : "Next"}
              </button>
            )}

            {step === "import" && (source === "POSTEX" || source === "POSTEX2") && postexSubStep === "phone-select" && (
              <button
                type="button"
                onClick={handlePostexConfirm}
                disabled={!postexPhoneColumn || postexConfirming}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {postexConfirming ? "Importing..." : `Import ${postexTotalRows} Orders`}
              </button>
            )}

            {step === "import" && (source === "LEOPARDS" || source === "LEOPARDS2") && leopardsSubStep === "phone-select" && (
              <button
                type="button"
                onClick={handleLeopardsConfirm}
                disabled={!leopardsPhoneColumn || leopardsConfirming}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {leopardsConfirming ? "Importing..." : `Import ${leopardsTotalRows} Packets`}
              </button>
            )}

            {step === "import" && source === "SHEETS" && sheetsSubStep === "phone-select" && (
              <button
                type="button"
                onClick={handleSheetsConfirm}
                disabled={!sheetsPhoneColumn || sheetsConfirming}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {sheetsConfirming ? "Importing..." : `Import ${sheetsTotalRows} Rows`}
              </button>
            )}

            {step === "import" && source === "CSV" && csvSubStep === "confirm" && (
              <button
                type="button"
                onClick={handleCsvConfirm}
                disabled={csvConfirming}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {csvConfirming ? "Importing..." : `Import ${csvRecipients.length} Recipients`}
              </button>
            )}

            {step === "import" && source === "MANUAL" && (
              <button
                type="button"
                onClick={handleManualConfirm}
                disabled={manualPhones.length === 0 || manualSubmitting}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {manualSubmitting
                  ? "Saving..."
                  : `Save ${manualPhones.length} Number${manualPhones.length !== 1 ? "s" : ""}`}
              </button>
            )}

            {step === "done" && (
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
