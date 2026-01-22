// app/lib/useVideoSocket.ts
import { io, Socket } from "socket.io-client";
import { getToken } from "./auth";
import { API_BASE } from "./api";

let videoSocket: Socket | null = null;

export function useVideoSocket(roomId: string, userId?: string) {
  if (!roomId || !userId) return null;

  if (!videoSocket) {
    videoSocket = io(
      `${API_BASE}/video-room`,
      {
        auth: { token: getToken() },
        query: { roomId, userId },
        transports: ["websocket"],
      }
    );
  }

  return videoSocket;
}
