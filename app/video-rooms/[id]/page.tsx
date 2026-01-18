"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AgoraRTC, {
  IAgoraRTCClient,
  ILocalVideoTrack,
  ILocalAudioTrack,
} from "agora-rtc-sdk-ng";
import { joinVideoRoomApi } from "@/app/lib/api";

export default function VideoRoomJoinPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const router = useRouter();

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);

  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;
  useEffect(() => {
    joinRoom();

    return () => {
      clientRef.current?.leave();
    };
  }, []);

  async function joinRoom() {
    try {
      const res = await joinVideoRoomApi(roomId);
      setRoom(res.room);
console.log(res,  process.env.NEXT_PUBLIC_AGORA_APP_ID)
      const client = AgoraRTC.createClient({
        mode: "live",
        codec: "vp8",
      });

      clientRef.current = client;

      // Viewer by default
      await client.setClientRole("audience");

      await client.join(
        process.env.NEXT_PUBLIC_AGORA_APP_ID!,
       `room_${roomId}`,                   // channel
        res.token.token,            // agora token
        res.token.uid               // rtc uid
      );

      // Remote users
      client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);

        if (mediaType === "video") {
          const el = document.createElement("div");
          el.className =
            "aspect-video bg-black rounded overflow-hidden";
          el.id = `remote-${user.uid}`;

          remoteRef.current?.appendChild(el);
          user.videoTrack?.play(el);
        }

        if (mediaType === "audio") {
          user.audioTrack?.play();
        }
      });

      setLoading(false);
    } catch (e) {
      console.error(e);
      alert("Failed to join video room");
      router.push("/video-rooms");
    }
  }

  if (loading || !room) {
    return (
      <div className="h-screen flex items-center justify-center text-white bg-black">
        Joining video room...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* HEADER */}
      <header className="px-4 py-3 border-b border-slate-800 flex justify-between">
        <div>
          <h1 className="font-semibold">{room.title}</h1>
          <p className="text-xs text-slate-400">
            Host: {room.host.nickName}
          </p>
        </div>

        <button
          onClick={() => router.push("/video-rooms")}
          className="bg-red-600 px-3 py-1 rounded text-sm"
        >
          Leave
        </button>
      </header>

      {/* VIDEO GRID */}
      <main className="flex-1 p-3">
        <div
          ref={remoteRef}
          className="
            grid 
            grid-cols-1 
            sm:grid-cols-2 
            lg:grid-cols-3 
            gap-3
          "
        >
          {/* Remote videos injected here */}
        </div>
      </main>
    </div>
  );
}
