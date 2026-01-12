"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Socket } from "socket.io-client";
import { Send, Heart, Star, Coins, Image as ImageIcon } from "lucide-react";
import { API_BASE } from "../../lib/api";
import { getToken } from "../../lib/auth";
import { getChatSocket } from "@/app/lib/socket";

/* =========================
   TYPES
========================= */
interface LevelInfo {
  name: string;
  imageUrl: string;
  levelNo: number;
}

interface OtherMember {
  id: string;
  nickName: string;
  profilePicture: string | null;
  gold: number;
  charmLevel: LevelInfo;
  wealthLevel: LevelInfo;
}

type MessageType = "TEXT" | "IMAGE" | "SYSTEM";

interface Message {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  type: MessageType;
  sender: {
    id: string;
    profilePicture: string | null;
  };
}

interface MessagesResponse {
  otherMember: OtherMember;
  messages: Message[];
}

/* =========================
   COMPONENT
========================= */
export default function ChatPage() {
  const { id: conversationId } = useParams<{ id: string }>();
  const router = useRouter();

  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [otherUser, setOtherUser] = useState<OtherMember | null>(null);
  const [text, setText] = useState("");
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [uploading, setUploading] = useState(false);

  /* =========================
     INITIAL LOAD
  ========================= */
  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    const payload = JSON.parse(atob(token.split(".")[1]));
    setMyUserId(payload.userId);

    fetch(`${API_BASE}/chat/messages?conversationId=${conversationId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data: MessagesResponse) => {
        setOtherUser(data.otherMember);
        setMessages([...data.messages].reverse());
      })
      .catch(() => router.replace("/login"));
  }, [conversationId, router]);

  /* =========================
     SOCKET SETUP (TEXT ONLY)
  ========================= */
  useEffect(() => {
    const socket = getChatSocket();
    socketRef.current = socket;

    const join = () => socket.emit("conversation:join", { conversationId });

    socket.connected ? join() : socket.once("connect", join);

    const onMessageNew = (message: Message) => {
      console.log("message", message);
      setIsOtherTyping(false);
      setMessages((prev) =>
        prev.some((m) => m.id === message.id) ? prev : [...prev, message]
      );
    };

    socket.on("message:new", onMessageNew);
    socket.on("typing:start", ({ userId }) => {
      if (userId !== myUserId) setIsOtherTyping(true);
    });
    socket.on("typing:stop", ({ userId }) => {
      if (userId !== myUserId) setIsOtherTyping(false);
    });

    return () => {
      socket.emit("conversation:leave", { conversationId });
      socket.off("message:new", onMessageNew);
    };
  }, [conversationId, myUserId]);

  /* =========================
     AUTO SCROLL
  ========================= */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOtherTyping]);

  /* =========================
     SEND TEXT (SOCKET)
  ========================= */
  function sendMessage() {
    if (!text.trim() || !socketRef.current) return;

    socketRef.current.emit("message:send", {
      conversationId,
      content: text,
    });

    socketRef.current.emit("typing:stop", { conversationId });
    setText("");
  }

  /* =========================
     SEND IMAGE (API ONLY)
  ========================= */
  async function handleImageSend(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const token = getToken();
    if (!token) return;

    const formData = new FormData();
    formData.append("conversationId", conversationId);
    formData.append("image", file);

    try {
      const res = await fetch(`${API_BASE}/chat/send-message`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const apiMessage = await res.json();

      // Normalize message for UI
      const message: Message = {
        ...apiMessage,
        sender: {
          id: myUserId!,
          profilePicture: null, // or your cached avatar
        },
      };
    } catch (err) {
      console.error("Image send failed", err);
    } finally {
      e.target.value = "";
    }
  }

  /* =========================
     RENDER
  ========================= */
  return (
    <div className="flex flex-col h-screen bg-[#0a0c10]">
      {/* HEADER */}
      <div className="p-4">
        <div className="bg-slate-800/50 rounded-3xl p-6 flex flex-col items-center">
          <img
            src={
              otherUser?.profilePicture
                ? `${API_BASE}${otherUser.profilePicture}`
                : "/default-avatar.png"
            }
            className="w-20 h-20 rounded-full border"
          />
          <h2 className="text-white text-xl mt-2 font-bold">
            {otherUser?.nickName}
          </h2>

          <div className="flex gap-2 mt-3">
            <Badge icon={<Coins size={12} />} value={otherUser?.gold ?? 0} />
            <Badge icon={<Heart size={12} />} value={10} />
            <Badge icon={<Star size={12} />} value={10} />
          </div>
        </div>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto px-4 space-y-5">
        {messages.map((m) => {
          const isMe = m.senderId === myUserId;

          if (m.type === "SYSTEM") {
            return (
              <div key={m.id} className="text-center text-xs text-slate-400">
                {m.content}
              </div>
            );
          }

          return (
            <div
              key={m.id}
              className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}
            >
              <img
                src={
                  m.sender.profilePicture
                    ? `${API_BASE}${m.sender.profilePicture}`
                    : "/default-avatar.png"
                }
                className="w-10 h-10 rounded-full"
              />

              <div
                className={`px-4 py-2 rounded-2xl max-w-[70%]
                ${
                  m.type === "IMAGE"
                    ? "bg-transparent p-1"
                    : isMe
                    ? "bg-blue-600 text-white rounded-br-none"
                    : "bg-slate-800 text-white rounded-bl-none"
                }`}
              >
                {m.type === "IMAGE" ? (
                  <img
                    src={`${API_BASE}${m.content}`}
                    className="rounded-lg max-h-60 cursor-pointer"
                    onClick={() =>
                      window.open(`${API_BASE}${m.content}`, "_blank")
                    }
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            </div>
          );
        })}

        {isOtherTyping && (
          <div className="text-sm text-slate-400 animate-pulse">typing…</div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* INPUT */}
      <div className="p-4">
        <div className="flex gap-2 bg-slate-900 rounded-full p-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3 rounded-full bg-slate-700"
            disabled={uploading}
          >
            <ImageIcon size={16} />
          </button>

          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              socketRef.current?.emit("typing:start", { conversationId });
              if (typingTimeoutRef.current)
                clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = setTimeout(() => {
                socketRef.current?.emit("typing:stop", { conversationId });
              }, 1000);
            }}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 bg-transparent px-4 text-white outline-none"
          />

          <button
            onClick={sendMessage}
            className="bg-blue-600 p-3 rounded-full"
          >
            <Send size={16} />
          </button>
        </div>

        <input
          type="file"
          accept="image/*"
          hidden
          ref={fileInputRef}
          onChange={handleImageSend}
        />
      </div>
    </div>
  );
}

/* =========================
   BADGE
========================= */
function Badge({ icon, value }: { icon: React.ReactNode; value: number }) {
  return (
    <div className="bg-slate-700 px-3 py-1 rounded-full flex items-center gap-1 text-xs text-white">
      {icon}
      {value}
    </div>
  );
}
