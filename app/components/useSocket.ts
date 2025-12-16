import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io("http://localhost:8000", {
      transports: ["websocket"],
    });

    socket.on("connect", () => {
      console.log("🔌 SINGLE socket connected:", socket?.id);
    });
  }

  return socket;
}
