"use client";

import { useEffect, useState } from "react";
import { getDevices, deleteDevice, type Device } from "@/lib/api";
import { socket } from "@/lib/socket";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { formatDistanceToNow } from "@/lib/time";

export function DeviceTable() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    getDevices()
      .then(setDevices)
      .catch(console.error)
      .finally(() => setLoading(false));

    // Real-time: device status changed
    function onStatusChanged(payload: {
      deviceId: string;
      online: boolean;
      lastSeen: string;
    }) {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === payload.deviceId
            ? { ...d, online: payload.online, lastSeen: payload.lastSeen }
            : d
        )
      );
    }

    // Real-time: telemetry updated
    function onTelemetryUpdated(payload: {
      deviceId: string;
      battery?: number;
      simCarrier?: string;
      phoneNumber?: string;
      signalStrength?: number;
      androidVersion?: string;
      appVersion?: string;
      networkType?: string;
    }) {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === payload.deviceId ? { ...d, ...payload } : d
        )
      );
    }

    socket.on("device:status_changed", onStatusChanged);
    socket.on("device:telemetry_updated", onTelemetryUpdated);

    return () => {
      socket.off("device:status_changed", onStatusChanged);
      socket.off("device:telemetry_updated", onTelemetryUpdated);
    };
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteDevice(deleteTarget.id);
      setDevices((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError("Failed to delete device. Please try again.");
      console.error("Failed to delete device:", err);
    } finally {
      setDeleting(false);
    }
  }

  function getBatteryColor(battery: number | null): string {
    if (battery === null) return "text-muted-foreground";
    if (battery > 50) return "text-green-400";
    if (battery >= 20) return "text-yellow-400";
    return "text-red-400";
  }

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground px-4 py-8 text-center">
        Loading devices...
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="text-sm text-muted-foreground px-4 py-8 text-center">
        No devices registered. Use the Register Device button to add one.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Battery</th>
              <th className="text-left px-3 py-2 font-medium">Carrier</th>
              <th className="text-left px-3 py-2 font-medium">Phone</th>
              <th className="text-left px-3 py-2 font-medium">Signal</th>
              <th className="text-left px-3 py-2 font-medium">Network</th>
              <th className="text-left px-3 py-2 font-medium">Android</th>
              <th className="text-left px-3 py-2 font-medium">App</th>
              <th className="text-left px-3 py-2 font-medium">Queue</th>
              <th className="text-left px-3 py-2 font-medium">Last Seen</th>
              <th className="text-right px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr
                key={device.id}
                className="border-b border-border/50 hover:bg-accent/30 transition-colors"
              >
                <td className="px-3 py-2 font-medium text-foreground">
                  {device.name}
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        device.online ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                    <span className="text-muted-foreground">
                      {device.online ? "Online" : "Offline"}
                    </span>
                  </span>
                </td>
                <td className={`px-3 py-2 ${getBatteryColor(device.battery)}`}>
                  {device.battery !== null ? `${device.battery}%` : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {device.simCarrier ?? "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {device.phoneNumber ?? "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {device.signalStrength !== null
                    ? `${device.signalStrength} dBm`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {device.networkType ?? "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {device.androidVersion ?? "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {device.appVersion ?? "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {device.messageQueueCount}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {device.lastSeen ? formatDistanceToNow(device.lastSeen) : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => { setDeleteError(null); setDeleteTarget(device); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove device</DialogTitle>
            <DialogDescription>
              Remove <span className="font-medium text-foreground">{deleteTarget?.name}</span> from
              the dashboard? This will also delete all messages and campaigns associated with this device.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-2">
              {deleteError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Removing..." : "Remove"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
