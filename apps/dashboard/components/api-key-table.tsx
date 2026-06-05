"use client";

import { useEffect, useState } from "react";
import {
  getApiKeys,
  createApiKey,
  deleteApiKey,
  type ApiKey,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Check } from "lucide-react";
import { formatDistanceToNow } from "@/lib/time";

export function ApiKeyTable() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<"name" | "reveal">("name");
  const [keyName, setKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [rawKey, setRawKey] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    try {
      const data = await getApiKeys();
      setKeys(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!keyName.trim()) {
      setError("Name is required");
      return;
    }
    setError("");
    setCreating(true);
    try {
      const result = await createApiKey(keyName.trim());
      setRawKey(result.rawKey);
      setStep("reveal");
      await loadKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteApiKey(id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (e) {
      console.error(e);
    }
  }

  function handleCloseDialog() {
    setDialogOpen(false);
    setStep("name");
    setKeyName("");
    setRawKey("");
    setError("");
    setCopied(false);
  }

  function copyKey() {
    navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="text-xs text-muted-foreground py-4 text-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">
          {keys.length} key{keys.length !== 1 ? "s" : ""}
        </span>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          Generate New Key
        </Button>
      </div>

      {keys.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">
          No API keys. Generate one to allow external access.
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-3 py-2 font-medium">Name</th>
                <th className="text-left px-3 py-2 font-medium">Prefix</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Created</th>
                <th className="text-left px-3 py-2 font-medium">Last Used</th>
                <th className="text-left px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr
                  key={key.id}
                  className="border-b border-border/50 last:border-0 hover:bg-accent/20"
                >
                  <td className="px-3 py-2 font-medium text-foreground">
                    {key.name}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">
                    {key.keyPrefix}...
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={key.active ? "success" : "secondary"}>
                      {key.active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {formatDistanceToNow(key.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {key.lastUsed ? formatDistanceToNow(key.lastUsed) : "Never"}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-destructive-foreground hover:bg-destructive/20"
                      onClick={() => handleDelete(key.id)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create key dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {step === "name" ? "Generate API Key" : "API Key Created"}
            </DialogTitle>
          </DialogHeader>

          {step === "name" ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Key Name</Label>
                <Input
                  placeholder="e.g. Production App"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  autoFocus
                />
                {error && (
                  <p className="text-xs text-red-400">{error}</p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={handleCloseDialog}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCreate} disabled={creating}>
                  {creating ? "Generating..." : "Generate"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-md p-3">
                <p className="text-xs text-yellow-300">
                  This key will not be shown again. Copy it now.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Raw API Key</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted px-2 py-2 rounded font-mono break-all">
                    {rawKey}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={copyKey}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <Button size="sm" className="w-full" onClick={handleCloseDialog}>
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
