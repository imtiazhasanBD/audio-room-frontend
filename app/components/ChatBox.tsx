"use client";

import { useEffect, useState, useRef } from "react";
import type { Socket } from "socket.io-client";
import { API_BASE } from "../lib/api";

// 1. Updated Interface matching your JSON data exactly
interface ChatMessage {
  userId: string;
  role: "USER" | "HOST" | "ADMIN";
  nickName: string;
  profilePicture: string | null;
  gender: "male" | "female" | string;
  email?: string;
  dob?: string;
  country?: string;
  charmLevel?: number | null;
  charmLevelId?: number | null;
  message: string;
  timestamp: number;
}
type SystemMessage = {
  type: "JOIN" | "LEAVE";
  nickName: string;
  timestamp: number;
};

type AnyChatMessage = ChatMessage | SystemMessage;

type ChatMode = "ALL" | "SEAT_ONLY" | "LOCKED";

interface ChatBoxProps {
  socket: Socket | null;
  roomId: string;
  canControl: boolean; // Is current user Host/Admin?
  currentUserId: string; // Needed to identify "My" messages
  chatMode?: ChatMode | null;
}

export default function ChatBox({
  socket,
  roomId,
  canControl,
  currentUserId,
  chatMode,
}: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");

  // =====================================
  // SOCKET LISTENERS
  // =====================================
  useEffect(() => {
    if (!socket) return;

    const onMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    };
    const onSystemMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    };
    const onCleared = () => {
      setMessages([]);
    };

    const onModeChanged = (data: { mode: ChatMode }) => {
      //setMode(data.mode);
    };

    const onError = (err: { message: string }) => {
      // You might want a toast notification here instead of alert
      console.error("Chat Error:", err.message);
    };

    // Make sure these event names match your Gateway exactly!

    socket.on("chat:message", onMessage);
    socket.on("chat:cleared", onCleared);
    socket.on("chat:modeChanged", onModeChanged);
    socket.on("chat:system", onSystemMessage);
    socket.on("chat:error", onError);
    socket.emit("room.ready");
    
    return () => {
      socket.off("chat:message", onMessage);
      socket.off("chat:cleared", onCleared);
      socket.off("chat:modeChanged", onModeChanged);
      socket.off("chat:system", onSystemMessage);
      socket.off("chat:error", onError);
    };
  }, [socket]);

  // =====================================
  // ACTIONS
  // =====================================
  function sendMessage() {
    if (!socket) return;
    if (!text.trim()) return;

    socket.emit("chat:send", {
      message: text.trim(),
    });

    setText("");
  }

  console.log("chatMadeddddd", messages);
  const handleModeChange = (newMode: ChatMode) => {
    socket?.emit("chat:setMode", {
      roomId,
      userId: currentUserId,
      mode: newMode,
    });
  };

  const handleClear = () => {
    if (confirm("Are you sure you want to clear chat for everyone?")) {
      socket?.emit("chat:clear", { roomId, userId: currentUserId });
    }
  };


  // =====================================
  // HELPER COMPONENTS
  // =====================================

  // Format Time: 12:30 PM
  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Avatar Component with Fallback
  const UserAvatar = ({ msg }: { msg: ChatMessage }) => {
    if (msg.profilePicture) {
      return (
        <img
          src={`${API_BASE}${msg.profilePicture}`}
          alt={msg.nickName}
          className="w-8 h-8 rounded-full object-cover border border-slate-600"
        />
      );
    }
    // Fallback: First letter of name with color based on gender
    const bgColor = msg?.gender === "female" ? "bg-pink-600" : "bg-blue-600";
    return (
      <div
        className={`${bgColor} w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white border border-slate-600`}
      >
        {msg.nickName?.charAt(0)?.toUpperCase()}
      </div>
    );
  };
  console.log(messages);
  // =====================================
  // UI RENDER
  // =====================================
  return (
    <div className="flex flex-col h-full max-h-[600px] w-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-800">
      {/* HEADER */}
      <div className="bg-slate-800 p-3 flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-white text-sm">Live Chat</h3>
          {/* Status Badge */}
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              chatMode === "LOCKED"
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : chatMode === "SEAT_ONLY"
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "bg-green-500/20 text-green-400 border border-green-500/30"
            }`}
          >
            {chatMode === "ALL"
              ? "Everyone"
              : chatMode === "SEAT_ONLY"
              ? "Seated Only"
              : "Locked"}
          </span>
        </div>

        {/* Host Controls (Dropdown or Mini Toolbar) */}
        {canControl && (
          <div className="flex gap-1">
            <button
              onClick={() => handleModeChange("ALL")}
              className={`p-1.5 rounded hover:bg-slate-700 transition ${
                chatMode === "ALL" ? "text-blue-400" : "text-slate-400"
              }`}
              title="Allow All"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </button>
            <button
              onClick={() => handleModeChange("SEAT_ONLY")}
              className={`p-1.5 rounded hover:bg-slate-700 transition ${
                chatMode === "SEAT_ONLY" ? "text-amber-400" : "text-slate-400"
              }`}
              title="Seated Only"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 20v-5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v5" />
                <path d="M14 10V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v5" />
                <path d="M5 21V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14" />
              </svg>
            </button>
            <button
              onClick={() => handleModeChange("LOCKED")}
              className={`p-1.5 rounded hover:bg-slate-700 transition ${
                chatMode === "LOCKED" ? "text-red-400" : "text-slate-400"
              }`}
              title="Lock Chat"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </button>
            <button
              onClick={handleClear}
              className="p-1.5 rounded hover:bg-red-900/50 text-slate-400 hover:text-red-400 transition"
              title="Clear Chat"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* MESSAGE LIST */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-60">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="text-xs mt-2">No messages yet</span>
          </div>
        )}

        {messages?.map((m, i) => {
          // normal chat message (your existing UI)
          return (
            <div key={i} className="flex gap-3">
              <UserAvatar msg={m} />
              <div>
                <div className="text-xs text-slate-300">
                  {m.nickName} · {formatTime(m.timestamp)}
                </div>
                <div className="bg-slate-800 p-2 rounded">{m.message}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* FOOTER / INPUT AREA */}
      <div className="p-3 bg-slate-800 border-t border-slate-700">
        {chatMode === "LOCKED" && !canControl ? (
          <div className="text-center text-xs text-red-400 py-2 bg-red-900/20 rounded border border-red-900/30">
            Chat is currently locked by the host.
          </div>
        ) : (
          <div className="relative">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder={
                chatMode === "SEAT_ONLY" && !canControl
                  ? "Only seated users can chat..."
                  : "Type a message..."
              }
              disabled={
                chatMode === "SEAT_ONLY" &&
                !canControl /* Add seat check logic here if you have it in props */
              }
              className="w-full bg-slate-900 text-slate-200 text-sm rounded-full pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600 border border-slate-700 placeholder-slate-500 transition-all"
            />
            <button
              onClick={sendMessage}
              disabled={!text.trim()}
              className="absolute right-1.5 top-1.5 p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-500 disabled:opacity-50 disabled:bg-slate-700 transition"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
