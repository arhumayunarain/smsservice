"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Smartphone,
  MessageSquare,
  Settings,
  LogOut,
  FileText,
  Megaphone,
  ScrollText,
  Users,
} from "lucide-react";
import { clearToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/devices", label: "Devices", icon: Smartphone },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/recipients", label: "Recipients", icon: Users },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/send", label: "Send SMS", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  function handleLogout() {
    clearToken();
    router.push("/login");
  }

  return (
    <aside className="flex flex-col w-[220px] min-h-screen bg-[hsl(222.2,84%,3%)] border-r border-border shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          SMS Gateway
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-4 py-2 text-sm transition-colors",
                active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="border-t border-border">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
