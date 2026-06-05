"use client";

import { SendSmsForm } from "@/components/send-sms-form";

export default function SendPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-border">
        <h1 className="text-sm font-semibold text-foreground">Send SMS</h1>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto px-5 py-4 max-w-2xl">
        <SendSmsForm />
      </div>
    </div>
  );
}
