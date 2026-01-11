"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import type { Socket } from "socket.io-client";
import { API_BASE } from "../lib/api";
import { getToken, clearToken } from "../lib/auth";
import { getChatSocket } from "../lib/socket";

/* =========================
   TYPES
========================= */
type MessageType = "TEXT" | "IMAGE" | "SYSTEM";

interface Conversation {
  id: string;
  type: "PRIVATE" | "GROUP";

  otherUser?: {
    id: string;
    nickName: string;
    profilePicture: string | null;
    lastSeenAt: string | null;
  };

  title?: string;
  image?: string | null;

  lastMessage?: {
    id: string;
    content: string;
    createdAt: string;
    type?: MessageType;
  } | null;

  lastMessageAt: string | null;
  unreadCount: number;
}

interface ConversationUpdatePayload {
  conversationId: string;
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    type?: MessageType;
  };
  unreadIncrement: number;
}

/* =========================
   COMPONENT
========================= */
export default function InboxPage() {
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  /* =========================
     FETCH CONVERSATIONS
  ========================= */
  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    fetch(`${API_BASE}/chat/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setConversations(data.filter(Boolean));
        } else {
          setConversations([]);
        }
      })
      .catch(() => {
        clearToken();
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  /* =========================
     SOCKET SETUP
  ========================= */
  useEffect(() => {
    const socket = getChatSocket();
    socketRef.current = socket;

    const onConversationUpdate = (data: ConversationUpdatePayload) => {
      const msg = data?.lastMessage;
      if (!msg || !msg.id) return;

      setConversations((prev) => {
        if (!Array.isArray(prev)) return [];

        return prev
          .filter(Boolean)
          .map((c) => {
            if (!c || !c.id) return c;
            if (c.id !== data.conversationId) return c;

            return {
              ...c,
              lastMessage: {
                id: msg.id,
                content: msg.content,
                createdAt: msg.createdAt,
                type: msg.type,
              },
              lastMessageAt: msg.createdAt,
              unreadCount: (c.unreadCount ?? 0) + (data.unreadIncrement ?? 0),
            };
          });
      });
    };

    const onPresenceOnline = ({ userId }: { userId: string }) => {
      setConversations((prev) =>
        prev
          .filter(Boolean)
          .map((c) => {
            if (!c?.otherUser || c.otherUser.id !== userId) return c;
            return {
              ...c,
              otherUser: { ...c.otherUser, lastSeenAt: null },
            };
          }),
      );
    };

    const onPresenceOffline = ({
      userId,
      lastSeen,
    }: {
      userId: string;
      lastSeen: string;
    }) => {
      setConversations((prev) =>
        prev
          .filter(Boolean)
          .map((c) => {
            if (!c?.otherUser || c.otherUser.id !== userId) return c;
            return {
              ...c,
              otherUser: { ...c.otherUser, lastSeenAt: lastSeen },
            };
          }),
      );
    };

    socket.on("conversation:update", onConversationUpdate);
    socket.on("presence:online", onPresenceOnline);
    socket.on("presence:offline", onPresenceOffline);

    return () => {
      socket.off("conversation:update", onConversationUpdate);
      socket.off("presence:online", onPresenceOnline);
      socket.off("presence:offline", onPresenceOffline);
    };
  }, []);

  /* =========================
     HELPERS
  ========================= */
  function timeAgo(date?: string | null) {
    if (!date) return "";
    const diff = Date.now() - new Date(date).getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
    return `${Math.floor(diff / 86_400_000)}d`;
  }

  function lastMessagePreview(c: Conversation) {
    if (!c.lastMessage) return "No messages yet";
    if (c.lastMessage.type === "IMAGE") return "🖼️ Photo";
    if (c.lastMessage.type === "SYSTEM") return c.lastMessage.content;
    return c.lastMessage.content;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0c10]">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  /* =========================
     RENDER
  ========================= */
  return (
    <div className="min-h-screen bg-[#0a0c10] px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Inbox</h1>

        <motion.div className="space-y-3">
          {conversations.length === 0 && (
            <p className="text-slate-500 text-center text-sm">
              No conversations yet
            </p>
          )}

          {conversations.map((c) => {
            if (!c) return null;

            const isGroup = c.type === "GROUP";
            const name = isGroup
              ? c.title ?? "Group"
              : c.otherUser?.nickName ?? "Private chat";

            return (
              <button
                key={c.id}
                onClick={() => {
                  setConversations((prev) =>
                    prev
                      .filter(Boolean)
                      .map((x) =>
                        x.id === c.id ? { ...x, unreadCount: 0 } : x,
                      ),
                  );
                  router.push(`/inbox/${c.id}`);
                }}
                className="w-full bg-slate-900/40 border border-white/10 rounded-2xl p-4 text-left hover:bg-slate-900"
              >
                <div className="flex justify-between items-center">
                  <div className="flex gap-3 items-center">
                    <div className="relative shrink-0">
                      {isGroup ? (
                        <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center">
                          <Users size={18} className="text-purple-400" />
                        </div>
                      ) : (
                        <img
                          src={
                            c.otherUser?.profilePicture
                              ? `${API_BASE}${c.otherUser.profilePicture}`
                              : "/avatar.png"
                          }
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="text-white font-medium truncate">
                        {name}
                      </div>
                      <div className="text-slate-400 text-xs truncate max-w-[220px]">
                        {lastMessagePreview(c)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className="text-[10px] text-gray-400">
                      {timeAgo(c.lastMessageAt)}
                    </div>

                    {c.unreadCount > 0 && (
                      <span className="bg-purple-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
