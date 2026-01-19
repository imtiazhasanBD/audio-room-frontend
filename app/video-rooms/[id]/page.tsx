"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AgoraRTC, {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
} from "agora-rtc-sdk-ng";
import { joinVideoRoomApi } from "@/app/lib/api";

export default function VideoRoomJoinPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const isHost = searchParams.get("host") === "1";
  const router = useRouter();

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localVideoRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);
  const joiningRef = useRef(false);
  
  const localTracksRef = useRef<{
    video?: ICameraVideoTrack;
    audio?: IMicrophoneAudioTrack;
  }>({});

  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId) return;
    
    // Use a small delay to ensure the DOM is ready for the refs
    const init = async () => {
      await joinRoom();
    };
    init();

    return () => {
      leaveRoom();
    };
  }, [roomId]);

  async function joinRoom() {
    if (joiningRef.current || clientRef.current) return;
    joiningRef.current = true;

    try {
      const res = await joinVideoRoomApi(roomId);
      setRoom(res.room);

      const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
      clientRef.current = client;

      await client.setClientRole(isHost ? "host" : "audience");
      
      await client.join(
        process.env.NEXT_PUBLIC_AGORA_APP_ID!,
        `room_${roomId}`,
        res.token.token,
        res.token.uid
      );

      // CRITICAL: Set loading to false BEFORE tracks start 
      // so the localVideoRef div actually exists in the DOM
      setLoading(false);

      if (isHost) {
        const [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks();
        localTracksRef.current.audio = mic;
        localTracksRef.current.video = cam;

        await client.publish([mic, cam]);

        // Wait for next tick to ensure localVideoRef is bound to the DOM
        setTimeout(() => {
          if (localVideoRef.current) {
            cam.play(localVideoRef.current);
          } else {
            console.error("Local video container not found!");
          }
        }, 500);

      } else {
        // VIEWER LOGIC
        client.on("user-published", async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === "video") {
            let el = document.getElementById(`remote-${user.uid}`);
            if (!el) {
              el = document.createElement("div");
              el.id = `remote-${user.uid}`;
              el.className = "w-full aspect-video bg-slate-900 rounded-lg overflow-hidden border border-slate-700 shadow-xl";
              remoteRef.current?.appendChild(el);
            }
            user.videoTrack?.play(el);
          }
          if (mediaType === "audio") {
            user.audioTrack?.play();
          }
        });

        client.on("user-unpublished", (user) => {
          document.getElementById(`remote-${user.uid}`)?.remove();
        });
      }

      client.on("connection-state-change", (cur) => {
        if (cur === "DISCONNECTED") {
          alert("Live has ended");
          router.push("/video-rooms");
        }
      });

    } catch (e) {
      console.error("Join failed:", e);
      joiningRef.current = false;
      alert("Stream unavailable or permission denied");
      router.push("/video-rooms");
    }
  }

  async function leaveRoom() {
    try {
      localTracksRef.current.video?.stop();
      localTracksRef.current.video?.close();
      localTracksRef.current.audio?.stop();
      localTracksRef.current.audio?.close();
      await clientRef.current?.leave();
    } catch (err) {
      console.error("Leave error:", err);
    } finally {
      clientRef.current = null;
      joiningRef.current = false;
    }
  }

  if (loading || !room) {
    return (
      <div className="h-screen flex items-center justify-center text-white bg-black">
        <div className="animate-pulse">Connecting to live stream...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <header className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 backdrop-blur-md">
        <div>
          <h1 className="text-xl font-bold text-red-500 flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
            LIVE: {room.title}
          </h1>
          <p className="text-xs text-slate-400">
            {isHost ? "You are live (Host View)" : `Watching ${room.host.nickName}`}
          </p>
        </div>
        <button
          onClick={() => router.push("/video-rooms")}
          className="bg-slate-800 hover:bg-red-600 transition px-4 py-2 rounded-full text-sm"
        >
          Exit
        </button>
      </header>

      <main className="flex-1 p-6 flex items-center justify-center">
        {isHost ? (
          <div
            ref={localVideoRef}
            className="w-full max-w-5xl aspect-video bg-slate-900 rounded-lg overflow-hidden border-2 border-red-500/50"
          />
        ) : (
          <div ref={remoteRef} className="w-full max-w-5xl" />
        )}
      </main>
    </div>
  );
}