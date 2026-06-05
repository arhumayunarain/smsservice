"use client";

import { ApiKeyTable } from "@/components/api-key-table";
import { getMe } from "@/lib/api";
import { useEffect, useState, useCallback, Suspense } from "react";
import {
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Trash2,
  Save,
  Eye,
  EyeOff,
  RefreshCw,
} from "lucide-react";
import { useSearchParams } from "next/navigation";

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

// Separate inner component that uses useSearchParams (must be in Suspense boundary)
function SettingsContent() {
  const [username, setUsername] = useState<string | null>(null);
  const searchParams = useSearchParams();

  // Google status
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(true);
  const [googleDisconnecting, setGoogleDisconnecting] = useState(false);
  const [googleMessage, setGoogleMessage] = useState<string | null>(null);

  // PostEx Account 1
  const [postexToken, setPostexToken] = useState("");
  const [postexConfigured, setPostexConfigured] = useState(false);
  const [postexSaving, setPostexSaving] = useState(false);
  const [postexDeleting, setPostexDeleting] = useState(false);
  const [postexMessage, setPostexMessage] = useState<string | null>(null);
  const [postexMessageType, setPostexMessageType] = useState<"success" | "error">("success");
  const [showPostexToken, setShowPostexToken] = useState(false);

  // PostEx Account 2
  const [postexToken2, setPostexToken2] = useState("");
  const [postexConfigured2, setPostexConfigured2] = useState(false);
  const [postexSaving2, setPostexSaving2] = useState(false);
  const [postexDeleting2, setPostexDeleting2] = useState(false);
  const [postexMessage2, setPostexMessage2] = useState<string | null>(null);
  const [postexMessageType2, setPostexMessageType2] = useState<"success" | "error">("success");
  const [showPostexToken2, setShowPostexToken2] = useState(false);

  useEffect(() => {
    getMe()
      .then((me) => setUsername(me.username))
      .catch(console.error);
  }, []);

  const loadGoogleStatus = useCallback(async () => {
    setGoogleLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/auth/google/status`, {
        headers: getAuthHeader(),
      });
      if (res.ok) {
        const data = await res.json();
        setGoogleConnected(data.connected);
        setGoogleEmail(data.email ?? null);
      }
    } catch {
      // ignore
    } finally {
      setGoogleLoading(false);
    }
  }, []);

  const loadPostexStatus = useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/postex/status`, {
        headers: getAuthHeader(),
      });
      if (res.ok) {
        const data = await res.json();
        setPostexConfigured(data.configured);
        setPostexConfigured2(data.configured2);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadGoogleStatus();
    loadPostexStatus();
  }, [loadGoogleStatus, loadPostexStatus]);

  // Handle Google OAuth redirect callback (?google=connected)
  useEffect(() => {
    const googleParam = searchParams?.get("google");
    if (googleParam === "connected") {
      setGoogleMessage("Google account connected successfully!");
      loadGoogleStatus();
      // Clean up URL
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("google");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, [searchParams, loadGoogleStatus]);

  function handleConnectGoogle() {
    window.location.href = `${getApiUrl()}/auth/google`;
  }

  async function handleDisconnectGoogle() {
    setGoogleDisconnecting(true);
    try {
      const res = await fetch(`${getApiUrl()}/settings/google`, {
        method: "DELETE",
        headers: getAuthHeader(),
      });
      if (res.ok) {
        setGoogleConnected(false);
        setGoogleEmail(null);
        setGoogleMessage("Google account disconnected.");
      }
    } catch {
      setGoogleMessage("Failed to disconnect Google account.");
    } finally {
      setGoogleDisconnecting(false);
    }
  }

  async function handleSavePostexToken() {
    if (!postexToken.trim()) return;
    setPostexSaving(true);
    setPostexMessage(null);
    try {
      const res = await fetch(`${getApiUrl()}/settings/postex`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({ apiToken: postexToken.trim() }),
      });
      if (res.ok) {
        setPostexConfigured(true);
        setPostexToken("");
        setPostexMessage("PostEx API token saved.");
        setPostexMessageType("success");
      } else {
        const text = await res.text();
        setPostexMessage(text || "Failed to save token.");
        setPostexMessageType("error");
      }
    } catch {
      setPostexMessage("Failed to save token.");
      setPostexMessageType("error");
    } finally {
      setPostexSaving(false);
    }
  }

  async function handleDeletePostexToken() {
    setPostexDeleting(true);
    setPostexMessage(null);
    try {
      const res = await fetch(`${getApiUrl()}/settings/postex`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({ account: 1 }),
      });
      if (res.ok) {
        setPostexConfigured(false);
        setPostexToken("");
        setPostexMessage("PostEx API token removed.");
        setPostexMessageType("success");
      }
    } catch {
      setPostexMessage("Failed to remove token.");
      setPostexMessageType("error");
    } finally {
      setPostexDeleting(false);
    }
  }

  async function handleSavePostexToken2() {
    if (!postexToken2.trim()) return;
    setPostexSaving2(true);
    setPostexMessage2(null);
    try {
      const res = await fetch(`${getApiUrl()}/settings/postex`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({ apiToken: postexToken2.trim(), account: 2 }),
      });
      if (res.ok) {
        setPostexConfigured2(true);
        setPostexToken2("");
        setPostexMessage2("PostEx Account 2 token saved.");
        setPostexMessageType2("success");
      } else {
        const text = await res.text();
        setPostexMessage2(text || "Failed to save token.");
        setPostexMessageType2("error");
      }
    } catch {
      setPostexMessage2("Failed to save token.");
      setPostexMessageType2("error");
    } finally {
      setPostexSaving2(false);
    }
  }

  async function handleDeletePostexToken2() {
    setPostexDeleting2(true);
    setPostexMessage2(null);
    try {
      const res = await fetch(`${getApiUrl()}/settings/postex`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({ account: 2 }),
      });
      if (res.ok) {
        setPostexConfigured2(false);
        setPostexToken2("");
        setPostexMessage2("PostEx Account 2 token removed.");
        setPostexMessageType2("success");
      }
    } catch {
      setPostexMessage2("Failed to remove token.");
      setPostexMessageType2("error");
    } finally {
      setPostexDeleting2(false);
    }
  }

  return (
    <div className="flex-1 overflow-auto px-5 py-4 max-w-3xl space-y-8">
      {/* Admin info */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Admin Account
        </h2>
        <div className="text-sm text-foreground">
          <span className="text-muted-foreground">Username: </span>
          <span className="font-mono">{username ?? "Loading..."}</span>
        </div>
      </div>

      {/* Google Sheets */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Google Sheets Integration
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Connect your Google account to import recipients from Google Sheets
          spreadsheets. Requires read-only access to Sheets.
        </p>

        {googleMessage && (
          <div className="mb-3 flex items-center gap-2 p-2.5 bg-green-500/10 border border-green-500/30 rounded-md">
            <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
            <p className="text-xs text-green-400">{googleMessage}</p>
          </div>
        )}

        {googleLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            Checking connection...
          </div>
        ) : googleConnected ? (
          <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-md">
            <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
            <div className="flex-1 text-xs">
              <span className="text-green-400 font-medium">Connected</span>
              {googleEmail && (
                <span className="text-muted-foreground ml-1">({googleEmail})</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleDisconnectGoogle}
              disabled={googleDisconnecting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border text-muted-foreground rounded-md hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
              {googleDisconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 border border-border rounded-md">
            <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground flex-1">
              Not connected
            </p>
            <button
              type="button"
              onClick={handleConnectGoogle}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Connect Google Account
            </button>
          </div>
        )}

        <div className="mt-3 p-3 bg-muted/30 rounded-md">
          <p className="text-xs text-muted-foreground font-medium mb-1">Setup required:</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Create OAuth 2.0 Client ID in Google Cloud Console</li>
            <li>Add redirect URI: <code className="bg-muted px-1 rounded font-mono text-xs">http://localhost:3000/auth/google/callback</code></li>
            <li>Enable Google Sheets API in the Library</li>
            <li>Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars</li>
          </ol>
        </div>
      </div>

      {/* PostEx API */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          PostEx API
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Connect to PostEx to import shipment orders as campaign recipients.
          Get your API token from the PostEx merchant portal.
        </p>

        {/* Account 1 */}
        <div className="mb-4">
          <h3 className="text-xs font-medium text-foreground mb-2">Account 1</h3>

          {postexMessage && (
            <div
              className={`mb-3 flex items-center gap-2 p-2.5 rounded-md border ${
                postexMessageType === "success"
                  ? "bg-green-500/10 border-green-500/30"
                  : "bg-destructive/10 border-destructive/30"
              }`}
            >
              {postexMessageType === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              )}
              <p
                className={`text-xs ${
                  postexMessageType === "success" ? "text-green-400" : "text-destructive"
                }`}
              >
                {postexMessage}
              </p>
            </div>
          )}

          {postexConfigured && (
            <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-md mb-3">
              <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
              <p className="text-xs text-green-400 flex-1 font-medium">
                Account 1 token configured
              </p>
              <button
                type="button"
                onClick={handleDeletePostexToken}
                disabled={postexDeleting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border text-muted-foreground rounded-md hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                {postexDeleting ? "Removing..." : "Remove"}
              </button>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPostexToken ? "text" : "password"}
                  value={postexToken}
                  onChange={(e) => setPostexToken(e.target.value)}
                  placeholder={
                    postexConfigured
                      ? "Enter new token to update..."
                      : "Enter PostEx API token..."
                  }
                  className="w-full px-3 py-2 pr-9 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPostexToken((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                >
                  {showPostexToken ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={handleSavePostexToken}
                disabled={!postexToken.trim() || postexSaving}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="h-4 w-4" />
                {postexSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>

        {/* Account 2 */}
        <div>
          <h3 className="text-xs font-medium text-foreground mb-2">Account 2</h3>

          {postexMessage2 && (
            <div
              className={`mb-3 flex items-center gap-2 p-2.5 rounded-md border ${
                postexMessageType2 === "success"
                  ? "bg-green-500/10 border-green-500/30"
                  : "bg-destructive/10 border-destructive/30"
              }`}
            >
              {postexMessageType2 === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              )}
              <p
                className={`text-xs ${
                  postexMessageType2 === "success" ? "text-green-400" : "text-destructive"
                }`}
              >
                {postexMessage2}
              </p>
            </div>
          )}

          {postexConfigured2 && (
            <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-md mb-3">
              <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
              <p className="text-xs text-green-400 flex-1 font-medium">
                Account 2 token configured
              </p>
              <button
                type="button"
                onClick={handleDeletePostexToken2}
                disabled={postexDeleting2}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border text-muted-foreground rounded-md hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                {postexDeleting2 ? "Removing..." : "Remove"}
              </button>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPostexToken2 ? "text" : "password"}
                  value={postexToken2}
                  onChange={(e) => setPostexToken2(e.target.value)}
                  placeholder={
                    postexConfigured2
                      ? "Enter new token to update..."
                      : "Enter Account 2 API token..."
                  }
                  className="w-full px-3 py-2 pr-9 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPostexToken2((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                >
                  {showPostexToken2 ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={handleSavePostexToken2}
                disabled={!postexToken2.trim() || postexSaving2}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="h-4 w-4" />
                {postexSaving2 ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Obtain tokens from the PostEx merchant portal. Stored encrypted.
        </p>
      </div>

      {/* API key management */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          API Keys
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          API keys allow external services to access the SMS gateway API
          without a user session. Pass the key in the{" "}
          <code className="bg-muted px-1 rounded font-mono">x-api-key</code>{" "}
          header.
        </p>
        <ApiKeyTable />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border">
        <h1 className="text-sm font-semibold text-foreground">Settings</h1>
      </div>

      {/* Content wrapped in Suspense for useSearchParams */}
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <SettingsContent />
      </Suspense>
    </div>
  );
}
