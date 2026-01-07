import { io, Socket } from "socket.io-client";
import { API_BASE } from "./api";
import { getToken } from "./auth";

let socket: Socket | null = null;

export function getChatSocket(): Socket {
  if (!socket) {
    const token = getToken();
    socket = io(`${API_BASE}/chat`, {
      transports: ["websocket"],
      auth: { token },
    });
  }
  return socket;
}

export function disconnectChatSocket() {
  socket?.disconnect();
  socket = null;
}
