"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { API_BASE } from "../../lib/api";
import { getToken, clearToken } from "../../lib/auth";
import { Send, Heart, Star, Coins } from "lucide-react";

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

interface Message {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  isMe: boolean;
  sender: {
    id: string;
    profilePicture: string | null;
  };
}

interface MessagesResponse {
  otherMember: OtherMember;
  messages: Message[];
  nextCursor: string | null;
  hasMore: boolean;
}

export default function ChatPage() {
  const { id: conversationId } = useParams();
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [otherUser, setOtherUser] = useState<OtherMember | null>(null);
  const [text, setText] = useState("");
  const [myUserId, setMyUserId] = useState<string | null>(null);

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
      .catch(() => {
        router.replace("/login");
      });
  }, [conversationId, router]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const socket = io("http://localhost:8000/chat", {
      transports: ["websocket"],
      auth: { token },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("conversation:join", { conversationId });
    });

    socket.on("message:new", (msg: Message) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    return () => {
      socket.emit("conversation:leave", { conversationId });
      socket.disconnect();
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage() {
    if (!text.trim() || !socketRef.current) return;
    socketRef.current.emit("message:send", {
      conversationId,
      content: text,
    });
    setText("");
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0c10]">
      {/* 1. HEADER PROFILE CARD (Updated to match image layout) */}
      <div className="p-4 bg-[#0a0c10]">
        <div className="bg-slate-800/50 rounded-3xl p-6 flex flex-col items-center border border-white/5 shadow-xl">
          <div className="relative">
            <img
              src={otherUser?.profilePicture ? `${API_BASE}${otherUser.profilePicture}` : "/default-avatar.png"}
              className="w-20 h-20 rounded-full object-cover border-2 border-blue-500/30"
              alt="profile"
            />
          </div>
          <h2 className="text-white text-xl font-bold mt-3">
            {otherUser?.nickName || "User"}
          </h2>
          
          <div className="flex gap-2 mt-3">
            {/* Badges mapped to your slate theme */}
            <div className="bg-pink-600 px-3 py-1 rounded-full flex items-center gap-1 text-white text-[11px] font-bold">
               <Coins size={12} /> {otherUser?.gold || 21}
            </div>
            <div className="bg-orange-600 px-3 py-1 rounded-full flex items-center gap-1 text-white text-[11px] font-bold">
               <Heart size={12} fill="currentColor" /> 10
            </div>
            <div className="bg-cyan-600 px-3 py-1 rounded-full flex items-center gap-1 text-white text-[11px] font-bold">
               <Star size={12} fill="currentColor" /> 10
            </div>
          </div>
        </div>
      </div>

      {/* 2. MESSAGES AREA */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {messages.map((m) => {
          const isMe = m.senderId === myUserId;

          return (
            <div key={m.id} className={`flex items-end gap-3 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
              {/* Avatar on left/right based on sender */}
              <div className="relative flex-shrink-0">
                <img
                  src={m.sender.profilePicture ? `${API_BASE}${m.sender.profilePicture}` : "/default-avatar.png"}
                  className="w-10 h-10 rounded-full border border-white/10 object-cover"
                />
                {!isMe && (
                   <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#0a0c10] rounded-full" />
                )}
              </div>

              {/* Message Bubble with tailored corners */}
              <div
                className={`max-w-[75%] px-4 py-2.5 rounded-2xl shadow-lg
                ${isMe 
                  ? "bg-blue-600 text-white rounded-br-none" 
                  : "bg-slate-800 text-slate-100 rounded-bl-none"}`}
              >
                <p className="text-[14px] leading-relaxed">{m.content}</p>
                <span className={`text-[10px] mt-1 block opacity-50 ${isMe ? "text-right" : "text-left"}`}>
                   {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* 3. INPUT AREA */}
      <div className="p-4 bg-transparent border-t border-white/5">
        <div className="flex gap-2 bg-slate-900 p-2 rounded-full border border-white/10 shadow-inner">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 bg-transparent px-4 py-2 text-white outline-none text-sm placeholder:text-slate-500"
          />
          <button
            onClick={sendMessage}
            className="bg-blue-600 hover:bg-blue-500 p-3 rounded-full text-white transition-all active:scale-95"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}