"use client";

import { useRef, useState, useCallback } from "react";
import { Upload, FileSpreadsheet, X } from "lucide-react";

export interface UploadResult {
  importJobId: string;
  headers: string[];
  previewRows: Record<string, string>[];
  totalRows: number;
  fileName: string;
}

interface FileUploadProps {
  onUpload: (result: UploadResult) => void;
  apiBaseUrl?: string;
  token?: string;
}

export function FileUpload({ onUpload, apiBaseUrl, token }: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const getApiUrl = useCallback(() => {
    if (apiBaseUrl) return apiBaseUrl;
    if (typeof window !== "undefined") {
      return `${window.location.origin}/api`;
    }
    return "/api";
  }, [apiBaseUrl]);

  const getAuthHeader = useCallback((): Record<string, string> => {
    if (token) return { Authorization: `Bearer ${token}` };
    // Try to get token from localStorage (same pattern as api.ts)
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("sms_admin_token");
      if (stored) return { Authorization: `Bearer ${stored}` };
    }
    return {};
  }, [token]);

  const uploadFile = useCallback(
    async (file: File) => {
      const name = file.name.toLowerCase();
      if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) {
        setError("Only CSV and XLSX files are supported.");
        return;
      }

      setUploading(true);
      setError(null);
      setSelectedFile(file);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`${getApiUrl()}/import/upload`, {
          method: "POST",
          headers: getAuthHeader(),
          body: formData,
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || `Upload failed: HTTP ${res.status}`);
        }

        const data = await res.json();
        onUpload({ ...data, fileName: file.name });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setSelectedFile(null);
      } finally {
        setUploading(false);
      }
    },
    [getApiUrl, getAuthHeader, onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    [uploadFile]
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 p-10 rounded-lg border-2 border-dashed transition-colors cursor-pointer select-none ${
          dragging
            ? "border-primary bg-primary/10"
            : "border-border hover:border-muted-foreground/40 hover:bg-accent/20"
        } ${uploading ? "opacity-60 pointer-events-none" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx"
          className="hidden"
          onChange={handleChange}
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Uploading and parsing file...</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
              {selectedFile ? (
                <FileSpreadsheet className="h-6 w-6 text-primary" />
              ) : (
                <Upload className="h-6 w-6 text-primary" />
              )}
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Drag and drop or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Supports CSV and XLSX files (max 100 MB)
              </p>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
          <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {selectedFile && !uploading && !error && (
        <div className="flex items-center gap-2 p-2 bg-primary/5 border border-primary/20 rounded-md">
          <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm text-foreground flex-1 truncate">{selectedFile.name}</span>
        </div>
      )}
    </div>
  );
}
