"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { registerDevice } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check } from "lucide-react";

interface DevicePairingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeviceRegistered?: () => void;
}

export function DevicePairingDialog({
  open,
  onOpenChange,
  onDeviceRegistered,
}: DevicePairingDialogProps) {
  const [step, setStep] = useState<"name" | "qr">("name");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pairingData, setPairingData] = useState<{
    serverUrl: string;
    registrationToken: string;
    deviceId: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleRegister() {
    if (!name.trim()) {
      setError("Device name is required");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const device = await registerDevice(name.trim());
      // Use the browser's current origin so the QR code has the real IP
      const serverUrl = window.location.origin;
      setPairingData({
        serverUrl,
        registrationToken: device.registrationToken,
        deviceId: device.id,
      });
      setStep("qr");
      onDeviceRegistered?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to register device");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setStep("name");
    setName("");
    setError("");
    setPairingData(null);
    setCopied(false);
    onOpenChange(false);
  }

  function copyToken() {
    if (!pairingData) return;
    navigator.clipboard.writeText(pairingData.registrationToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {step === "name" ? "Register Device" : "Scan QR Code"}
          </DialogTitle>
        </DialogHeader>

        {step === "name" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="device-name">Device Name</Label>
              <Input
                id="device-name"
                placeholder="e.g. Phone 1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                autoFocus
              />
              {error && (
                <p className="text-xs text-destructive-foreground bg-destructive/20 px-2 py-1 rounded">
                  {error}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleRegister} disabled={loading}>
                {loading ? "Registering..." : "Register"}
              </Button>
            </div>
          </div>
        ) : (
          pairingData && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Scan this QR code with the SMS Gateway app to pair your device.
              </p>

              <div className="flex justify-center bg-white p-4 rounded-md">
                <QRCodeSVG
                  value={JSON.stringify(pairingData)}
                  size={200}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Registration Token (manual fallback)
                </Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted px-2 py-1.5 rounded font-mono truncate">
                    {pairingData.registrationToken}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={copyToken}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              <Button size="sm" className="w-full" onClick={handleClose}>
                Done
              </Button>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
