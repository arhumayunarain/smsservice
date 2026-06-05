"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { DailySendCount } from "@/lib/api";

interface TrendChartProps {
  data7: DailySendCount[];
  data30: DailySendCount[];
  loading?: boolean;
}

export function TrendChart({ data7, data30, loading }: TrendChartProps) {
  const [period, setPeriod] = useState<7 | 30>(7);
  const data = period === 7 ? data7 : data30;

  // Format date labels as MM-DD
  const formatted = data.map((d) => ({
    date: d.date.slice(5), // "2026-02-25" -> "02-25"
    count: d.count,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Daily Send Volume
        </span>
        <div className="flex gap-1">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setPeriod(d)}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                period === d
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
          Loading chart...
        </div>
      ) : formatted.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">
          No data for this period.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={formatted} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="sendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--background))",
                borderColor: "hsl(var(--border))",
                borderRadius: 4,
                fontSize: 11,
                color: "hsl(var(--foreground))",
              }}
              labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#sendGradient)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
