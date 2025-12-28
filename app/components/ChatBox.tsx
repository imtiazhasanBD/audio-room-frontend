// "use client";

// import { useEffect, useState } from "react";
// import type { Socket } from "socket.io-client";
// import { API_BASE } from "../lib/api";

// // --- Interfaces ---

// // 1. Defined the ChatBubble interface based on your JSON
// interface ChatBubble {
//   id: string;
//   swf: string;
//   icon: string;
//   name: string;
//   swftime: number;
// }

// interface ChatMessage {
//   type?: "CHAT";
//   userId: string;
//   nickName: string;
//   profilePicture: string | null;
//   gender: "male" | "female" | string;
//   message: string;
//   timestamp: number;
//   charmLevelId?: number | null;
//   // 2. Added optional chatBubble to the message interface
//   chatBubble?: ChatBubble | null; 
// }

// interface GiftMessage {
//   type: "GIFT";
//   senderProfile: {
//     nickName: string;
//     charmLevelId: number | null;
//     profilePicture: string | null;
//     gender: string;
//   };
//   individualReceiverName?: string;
//   receiverProfiles: {
//     nickName: string;
//   }[];
//   giftName: string;
//   giftIcon: string;
//   amount: number;
//   timestamp: number;
// }

// type AnyChatMessage = ChatMessage | GiftMessage;

// export default function ChatBox({ socket, roomId, canControl, currentUserId, chatMode }: any) {
//   const [messages, setMessages] = useState<AnyChatMessage[]>([]);
//   const [text, setText] = useState("");

//   useEffect(() => {
//     if (!socket) return;

//     const onChatMessage = (msg: ChatMessage) => {
//       console.log("message", msg)
//       setMessages((prev) => [...prev, { ...msg, type: "CHAT" }]);
//     };

//     const onSystemMessage = (msg: any) => {
//       if (msg.type === "GIFT" && msg.receiverProfiles?.length > 0) {
//         const individualMessages = msg.receiverProfiles.map((receiver: any) => ({
//           ...msg,
//           individualReceiverName: receiver.nickName,
//         }));
//         setMessages((prev) => [...prev, ...individualMessages]);
//       } else {
//         setMessages((prev) => [...prev, msg]);
//       }
//     };

//     socket.on("chat:message", onChatMessage);
//     socket.on("chat:system", onSystemMessage);
//     socket.on("chat:cleared", () => setMessages([]));
//     socket.emit("room.ready");
    
//     return () => {
//       socket.off("chat:message", onChatMessage);
//       socket.off("chat:system", onSystemMessage);
//     };
//   }, [socket]);

//   const sendMessage = () => {
//     if (!socket || !text.trim()) return;
//     socket.emit("chat:send", { message: text.trim() });
//     setText("");
//   };

//   const formatTime = (ts: number) => {
//     return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
//   };

//   const UserAvatar = ({ profilePicture, nickName, gender }: any) => {
//     if (profilePicture) {
//       return (
//         <img src={`${API_BASE}${profilePicture}`} alt="" className="w-8 h-8 rounded-full object-cover border border-slate-600" />
//       );
//     }
//     const bgColor = gender === "female" ? "bg-pink-600" : "bg-blue-600";
//     return (
//       <div className={`${bgColor} w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white border border-slate-600`}>
//         {nickName?.charAt(0)?.toUpperCase()}
//       </div>
//     );
//   };

//   return (
//     <div className="flex flex-col h-full max-h-[600px] w-full bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
//       {/* HEADER */}
//       <div className="bg-slate-800 p-3 flex items-center justify-between border-b border-slate-700">
//         <h3 className="font-bold text-white text-sm">Live Chat</h3>
//       </div>

//       {/* MESSAGE LIST */}
//       <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900 scrollbar-thin scrollbar-thumb-slate-700">
//         {messages.map((m, i) => {
          
//           // --- GIFT MESSAGE ---
//           if ("type" in m && m.type === "GIFT") {
//             return (
//               <div key={i} className="flex gap-3 items-start animate-in fade-in slide-in-from-left-1">
//                 <UserAvatar 
//                   profilePicture={m.senderProfile.profilePicture} 
//                   nickName={m.senderProfile.nickName} 
//                   gender={m.senderProfile.gender} 
//                 />
//                 <div className="flex-1">
//                   <div className="text-[10px] text-slate-500 mb-1">
//                     {m.senderProfile.nickName} · {formatTime(m.timestamp)}
//                   </div>
//                   <div className="bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg text-sm">
//                     <span className="text-slate-300">Sent </span>
//                     <span className="font-semibold text-white inline-flex items-center gap-1 mx-1">
//                       {m.giftName}
//                     </span>
//                     <span className="text-slate-300">to </span>
//                     <span className="font-bold text-amber-400">
//                       {m.individualReceiverName}
//                     </span>
//                     <div className="inline-flex items-center justify-center ml-1 align-middle">
//                       <img 
//                         src={`${API_BASE}${m.giftIcon}`} 
//                         alt={m.giftName} 
//                         className="w-5 h-5 object-contain" 
//                       />
//                     </div>
//                     <span className="ml-2 font-black text-amber-500">x{m.amount}</span>
//                   </div>
//                 </div>
//               </div>
//             );
//           }

//           // --- CHAT MESSAGE ---
//           const chatMsg = m as ChatMessage;
//           const hasBubble = !!chatMsg.chatBubble && !!chatMsg.chatBubble.icon;

//           return (
//             <div key={i} className="flex gap-3">
//               <UserAvatar 
//                 profilePicture={chatMsg.profilePicture} 
//                 nickName={chatMsg.nickName} 
//                 gender={chatMsg.gender} 
//               />
//               <div className="flex-1 max-w-[85%]"> 
//                 <div className="text-xs text-slate-400">
//                   {chatMsg.nickName} {chatMsg.charmLevelId ? `(${chatMsg.charmLevelId})` : ""} · {formatTime(chatMsg.timestamp)}
//                 </div>
                
//                 {/* 3. LOGIC SWITCH: 
//                    If hasBubble is true, render with custom background style.
//                    If false, render with standard tailwind classes.
//                 */}
//                 <div 
//                   className={`mt-1 text-sm break-words ${
//                     hasBubble 
//                       ? "text-white" // Usually VIP bubbles have white text, adjust if bubble is light
//                       : "bg-slate-800 p-2 rounded text-slate-200"
//                   }`}
//                   style={hasBubble ? {
//                     backgroundImage: `url('${API_BASE}${chatMsg.chatBubble!.icon}')`,
//                     backgroundSize: '100% 100%', // Stretch image to fit text
//                     backgroundRepeat: 'no-repeat',
//                     padding: '12px 16px', // Extra padding for bubble safe-zones
//                     minHeight: '40px',
//                     display: 'inline-block'
//                   } : undefined}
//                 >
//                   {chatMsg.message}
//                 </div>

//               </div>
//             </div>
//           );
//         })}
//       </div>

//       {/* FOOTER */}
//       <div className="p-3 bg-slate-800 border-t border-slate-700">
//         <div className="relative">
//           <input
//             value={text}
//             onChange={(e) => setText(e.target.value)}
//             onKeyDown={(e) => e.key === "Enter" && sendMessage()}
//             placeholder="Type a message..."
//             className="w-full bg-slate-900 text-slate-200 text-sm rounded-full pl-4 pr-12 py-3 focus:outline-none border border-slate-700"
//           />
//           <button onClick={sendMessage} className="absolute right-1.5 top-1.5 p-1.5 bg-blue-600 text-white rounded-full">
//             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// }



"use client";

import { useEffect, useState, useRef } from "react";
import type { Socket } from "socket.io-client";
import { API_BASE } from "../lib/api";

// --- Interfaces ---
interface ChatBubble {
  id: string;
  swf: string;
  icon: string;
  name: string;
  swftime: number;
}

interface ChatMessage {
  type?: "CHAT";
  userId: string;
  nickName: string;
  profilePicture: string | null;
  gender: "male" | "female" | string;
  message: string;
  timestamp: number;
  charmLevelId?: number | null;
  chatBubble?: ChatBubble | null;
}

interface GiftMessage {
  type: "GIFT";
  senderProfile: {
    nickName: string;
    charmLevelId: number | null;
    profilePicture: string | null;
    gender: string;
  };
  individualReceiverName?: string;
  receiverProfiles: { nickName: string }[];
  giftName: string;
  giftIcon: string;
  amount: number;
  timestamp: number;
}

type AnyChatMessage = ChatMessage | GiftMessage;

// --- Helper Component: SVGA Player ---
const SvgaBackground = ({ url, children }: { url: string; children: React.ReactNode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !url) return;

    let playerInstance: any = null;

    const initSvga = async () => {
      try {
        // 1. FIXED: Dynamically import svga.lite here (Client-side only)
        const { Downloader, Parser, Player } = await import("svga.lite");

        const downloader = new Downloader();
        const parser = new Parser();
        const player = new Player(canvasRef.current as HTMLCanvasElement);
        playerInstance = player;

        const fileData = await downloader.get(url);
        const svgaData = await parser.do(fileData);

        // 2. Configure Player
        player.set({
          loop: 0,
          fillMode: "forwards" as any, // Cast to any to avoid TS errors
          cacheFrames: true,
          intersectionObserverRender: true,
        });

        await player.mount(svgaData);
        player.start();
      } catch (err) {
        console.error("Failed to load SVGA bubble:", err);
      }
    };

    initSvga();

    return () => {
      // Cleanup logic
      if (playerInstance) {
        playerInstance.clear();
      }
    };
  }, [url]);

  return (
    <div className="relative inline-block">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 0 }}
      />
      <div className="relative z-10 px-5 py-3 text-white">
        {children}
      </div>
    </div>
  );
};

export default function ChatBox({ socket }: any) {
  const [messages, setMessages] = useState<AnyChatMessage[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!socket) return;

    const onChatMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, { ...msg, type: "CHAT" }]);
    };

    const onSystemMessage = (msg: any) => {
      if (msg.type === "GIFT" && msg.receiverProfiles?.length > 0) {
        const individualMessages = msg.receiverProfiles.map((receiver: any) => ({
          ...msg,
          individualReceiverName: receiver.nickName,
        }));
        setMessages((prev) => [...prev, ...individualMessages]);
      } else {
        setMessages((prev) => [...prev, msg]);
      }
    };

    socket.on("chat:message", onChatMessage);
    socket.on("chat:system", onSystemMessage);
    socket.on("chat:cleared", () => setMessages([]));
    socket.emit("room.ready");

    return () => {
      socket.off("chat:message", onChatMessage);
      socket.off("chat:system", onSystemMessage);
    };
  }, [socket]);

  const sendMessage = () => {
    if (!socket || !text.trim()) return;
    socket.emit("chat:send", { message: text.trim() });
    setText("");
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const UserAvatar = ({ profilePicture, nickName, gender }: any) => {
    if (profilePicture) {
      return (
        <img
          src={`${API_BASE}${profilePicture}`}
          alt=""
          className="w-8 h-8 rounded-full object-cover border border-slate-600"
        />
      );
    }
    const bgColor = gender === "female" ? "bg-pink-600" : "bg-blue-600";
    return (
      <div
        className={`${bgColor} w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white border border-slate-600`}
      >
        {nickName?.charAt(0)?.toUpperCase()}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full max-h-[600px] w-full bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
      <div className="bg-slate-800 p-3 flex items-center justify-between border-b border-slate-700">
        <h3 className="font-bold text-white text-sm">Live Chat</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900 scrollbar-thin scrollbar-thumb-slate-700">
        {messages.map((m, i) => {
          if ("type" in m && m.type === "GIFT") {
            return (
              <div
                key={i}
                className="flex gap-3 items-start animate-in fade-in slide-in-from-left-1"
              >
                <UserAvatar
                  profilePicture={m.senderProfile.profilePicture}
                  nickName={m.senderProfile.nickName}
                  gender={m.senderProfile.gender}
                />
                <div className="flex-1">
                  <div className="text-[10px] text-slate-500 mb-1">
                    {m.senderProfile.nickName} · {formatTime(m.timestamp)}
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg text-sm">
                    <span className="text-slate-300">Sent </span>
                    <span className="font-semibold text-white inline-flex items-center gap-1 mx-1">
                      {m.giftName}
                    </span>
                    <span className="text-slate-300">to </span>
                    <span className="font-bold text-amber-400">
                      {m.individualReceiverName}
                    </span>
                    <img
                      src={`${API_BASE}${m.giftIcon}`}
                      alt={m.giftName}
                      className="w-5 h-5 object-contain inline-block ml-1"
                    />
                    <span className="ml-2 font-black text-amber-500">x{m.amount}</span>
                  </div>
                </div>
              </div>
            );
          }

          const chatMsg = m as ChatMessage;
          const svgaUrl = chatMsg.chatBubble?.swf ? `${API_BASE}${chatMsg.chatBubble.swf}` : null;
          const staticUrl = chatMsg.chatBubble?.icon ? `${API_BASE}${chatMsg.chatBubble.icon}` : null;

          return (
            <div key={i} className="flex gap-3">
              <UserAvatar
                profilePicture={chatMsg.profilePicture}
                nickName={chatMsg.nickName}
                gender={chatMsg.gender}
              />
              <div className="flex-1 max-w-[85%]">
                <div className="text-xs text-slate-400">
                  {chatMsg.nickName} · {formatTime(chatMsg.timestamp)}
                </div>

                <div className="mt-1 text-sm break-words">
                  {svgaUrl ? (
                    <SvgaBackground url={svgaUrl}>{chatMsg.message}</SvgaBackground>
                  ) : staticUrl ? (
                    <div
                      className="text-white inline-block px-4 py-3 min-h-[40px]"
                      style={{
                        backgroundImage: `url('${staticUrl}')`,
                        backgroundSize: "100% 100%",
                        backgroundRepeat: "no-repeat",
                      }}
                    >
                      {chatMsg.message}
                    </div>
                  ) : (
                    <div className="bg-slate-800 p-2 rounded text-slate-200">
                      {chatMsg.message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 bg-slate-800 border-t border-slate-700">
        <div className="relative">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type a message..."
            className="w-full bg-slate-900 text-slate-200 text-sm rounded-full pl-4 pr-12 py-3 focus:outline-none border border-slate-700"
          />
          <button
            onClick={sendMessage}
            className="absolute right-1.5 top-1.5 p-1.5 bg-blue-600 text-white rounded-full"
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
      </div>
    </div>
  );
}