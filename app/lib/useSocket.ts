"use client";

import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { getToken } from "@/app/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API!;

export function useSocket(): Socket | null {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = getToken();
    console.log(token)
    if (!token) return; // ⛔ WAIT FOR TOKEN

    if (socketRef.current) return;

    const s = io(API_BASE, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
    });

    socketRef.current = s;

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  return socketRef.current;
}
