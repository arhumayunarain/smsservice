"use client";

import { useState } from "react";
import { DeviceTable } from "@/components/device-table";
import { DevicePairingDialog } from "@/components/device-pairing-dialog";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";

export default function DevicesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h1 className="text-sm font-semibold text-foreground">Devices</h1>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
          Register Device
        </Button>
      </div>

      {/* Device table */}
      <div className="flex-1 overflow-auto">
        <DeviceTable />
      </div>

      {/* Pairing dialog */}
      <DevicePairingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
