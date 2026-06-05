"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { socket } from "@/lib/socket";
import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    // Auth check
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }

    // Connect Socket.IO
    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, [router]);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
