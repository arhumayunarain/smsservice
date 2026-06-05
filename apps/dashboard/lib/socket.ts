"use client";

import { io } from "socket.io-client";

// Use current browser origin so it works regardless of IP
const wsUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost");

export const socket = io(wsUrl, {
  autoConnect: false,
  transports: ["websocket", "polling"],
});
