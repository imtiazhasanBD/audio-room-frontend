"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { MessageCircle, Users, LogOut } from "lucide-react";
import { API_BASE } from "../lib/api";
import { getToken, clearToken } from "../lib/auth";

interface Conversation {
  id: string;
  type: "PRIVATE" | "GROUP";

  otherUser?: {
    id: string;
    nickName: string;
    profilePicture: string | null;
    lastSeenAt: string | null;
  };

  title?: string; // for group chats
  image?: string | null;

  lastMessage?: {
    id: string;
    content: string;
    createdAt: string;
  } | null;

  lastMessageAt: string | null;
  unreadCount: number;
}

export default function InboxPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

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
      .then(setConversations)
      .catch(() => {
        clearToken();
        router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  function logout() {
    clearToken();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0c10]">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  function timeAgo(date?: string | null) {
    if (!date) return "";
    const diff = Date.now() - new Date(date).getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
    return `${Math.floor(diff / 86_400_000)}d`;
  }

  return (
    <div className="min-h-screen bg-[#0a0c10] px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-white">Inbox</h1>
          {/* <button
            onClick={logout}
            className="text-slate-400 hover:text-white flex items-center gap-2"
          >
            <LogOut size={16} />
            Logout
          </button> */}
        </div>

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
                onClick={() => router.push(`/inbox/${c.id}`)}
                className="w-full bg-slate-900/40 border border-white/10 rounded-2xl p-4 text-left hover:bg-slate-900"
              >
                <div className="flex gap-3 items-center">
                  {/* AVATAR */}
                  <div className="relative shrink-0">
                    {isGroup ? (
                      <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center">
                        <Users size={18} className="text-purple-400" />
                      </div>
                    ) : (
                      <img
                        src={
                          `${API_BASE}${c.otherUser?.profilePicture}` ||
                          "/avatar.png"
                        }
                        // alt={name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    )}
                  </div>

                  {/* TEXT */}
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">
                      {name}
                    </div>

                    <div className="text-slate-400 text-xs truncate max-w-[220px]">
                      {c.lastMessage?.content || "No messages yet"}
                    </div>
                  </div>
                </div>
                {/* RIGHT */}
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
              </button>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
