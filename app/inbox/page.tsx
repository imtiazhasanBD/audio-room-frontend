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

interface ConversationsResponse {
  conversations: Conversation[];
  nextCursor: string | null;
  hasMore: boolean;
}

interface ConversationUpdatePayload {
  conversationId: string;
  lastMessage: {
    conversationId: string;
    message: {
      id: string;
      content: string;
      createdAt: string;
      type?: MessageType;
    };
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

  // 🔥 Pagination state
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  /* =========================
     FETCH CONVERSATIONS
  ========================= */
  async function fetchConversations(loadMore = false) {
    if (loadingMore || (!hasMore && loadMore)) return;

    setLoadingMore(true);

    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    const params = new URLSearchParams({ limit: "20" });
    if (loadMore && cursor) params.append("cursor", cursor);

    const res = await fetch(
      `${API_BASE}/chat/conversations?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const data: ConversationsResponse = await res.json();

    setCursor(data.nextCursor);
    setHasMore(data.hasMore);

    setConversations((prev) =>
      loadMore
        ? [...prev, ...data.conversations]
        : data.conversations,
    );

    setLoading(false);
    setLoadingMore(false);
  }

  /* =========================
     INITIAL LOAD
  ========================= */
  useEffect(() => {
    fetchConversations(false);
  }, []);

  /* =========================
     SOCKET SETUP
  ========================= */
  useEffect(() => {
    const socket = getChatSocket();
    socketRef.current = socket;

 const onConversationUpdate = (data: ConversationUpdatePayload) => {
  const msg = data.lastMessage?.message;
  if (!msg) return;

  setConversations((prev) => {
    const existing = prev.find((c) => c.id === data.conversationId);
    if (!existing) return prev;

    return [
      {
        ...existing,
        lastMessage: {
          id: msg.id,
          content: msg.content,
          createdAt: msg.createdAt,
          type: msg.type,
        },
        lastMessageAt: msg.createdAt,
        unreadCount:
          (existing.unreadCount ?? 0) + (data.unreadIncrement ?? 0),
      },
      ...prev.filter((c) => c.id !== data.conversationId),
    ];
  });
};

    const onPresenceOnline = ({ userId }: { userId: string }) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.otherUser?.id === userId
            ? { ...c, otherUser: { ...c.otherUser, lastSeenAt: null } }
            : c,
        ),
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
        prev.map((c) =>
          c.otherUser?.id === userId
            ? { ...c, otherUser: { ...c.otherUser, lastSeenAt: lastSeen } }
            : c,
        ),
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
      <div
        className="max-w-2xl mx-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (
            el.scrollHeight - el.scrollTop === el.clientHeight &&
            hasMore &&
            !loadingMore
          ) {
            fetchConversations(true);
          }
        }}
      >
        <h1 className="text-2xl font-bold text-white mb-6">Inbox</h1>

        <motion.div className="space-y-3">
          {conversations.length === 0 && (
            <p className="text-slate-500 text-center text-sm">
              No conversations yet
            </p>
          )}

          {conversations.map((c) => {
            const isGroup = c.type === "GROUP";
            const name = isGroup
              ? c.title ?? "Group"
              : c.otherUser?.nickName ?? "Private chat";

            return (
              <button
                key={c.id}
                onClick={() => {
                  setConversations((prev) =>
                    prev.map((x) =>
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

          {loadingMore && (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
