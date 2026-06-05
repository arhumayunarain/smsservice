"use client";

import { Send, CheckCircle2, Smartphone } from "lucide-react";
import { DashboardStats } from "@/lib/api";

interface SummaryStatsProps {
  stats: DashboardStats | null;
  loading?: boolean;
}

export function SummaryStats({ stats, loading }: SummaryStatsProps) {
  const onlineCount = stats?.devices.filter((d) => d.online).length ?? 0;
  const totalCount = stats?.devices.length ?? 0;

  const rateColor =
    !stats
      ? "text-muted-foreground"
      : stats.deliveryRate >= 90
      ? "text-green-400"
      : stats.deliveryRate >= 70
      ? "text-amber-400"
      : "text-red-400";

  const cards = [
    {
      label: "Messages Today",
      value: loading ? "—" : (stats?.sentToday ?? 0).toLocaleString(),
      icon: Send,
      color: "text-blue-400",
    },
    {
      label: "Delivery Rate Today",
      value: loading ? "—" : `${stats?.deliveryRate ?? 0}%`,
      icon: CheckCircle2,
      color: rateColor,
    },
    {
      label: "Devices",
      value: loading ? "—" : `${onlineCount} / ${totalCount}`,
      sub: loading ? "" : onlineCount > 0 ? "online" : "all offline",
      icon: Smartphone,
      color: onlineCount > 0 ? "text-green-400" : "text-red-400",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-md border border-border bg-accent/10 px-4 py-3 flex items-start gap-3"
        >
          <div className={`mt-0.5 ${card.color}`}>
            <card.icon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{card.label}</div>
            <div className={`text-lg font-semibold ${card.color}`}>{card.value}</div>
            {card.sub && <div className="text-[10px] text-muted-foreground">{card.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
