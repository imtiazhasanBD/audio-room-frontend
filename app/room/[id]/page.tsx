"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import type { IAgoraRTCClient, ILocalAudioTrack } from "agora-rtc-sdk-ng";

import {
  approveSeatApi,
  banUserApi,
  getRoomDetail,
  joinRoomApi,
  leaveRoomApi,
  leaveSeatApi,
  Participant,
  requestSeatApi,
  RoomDetail,
} from "@/app/lib/api";

import { getCurrentUser, getToken } from "@/app/lib/auth";
import { SeatGrid } from "@/app/components/SeatGrid";
import { UserList } from "@/app/components/UserList";
import { HostPanel } from "@/app/components/HostPanel";
import SeatApprovalModal from "@/app/components/SeatApprovalModal";

// ✅ GLOBAL SINGLETON (CRITICAL FIX)
let AgoraRTC: any = null;

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = params.id;
  const router = useRouter();

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [micOn, setMicOn] = useState(true);

  const [agoraClient, setAgoraClient] = useState<IAgoraRTCClient | null>(null);
  const [localTrack, setLocalTrack] = useState<ILocalAudioTrack | null>(null);
  const [rtcJoined, setRtcJoined] = useState(false);

  const [seatRequests, setSeatRequests] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API as string;
  const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID as string;

  const user = getCurrentUser();
  const userId = user?.id;

  function println(msg: string) {
    setLog((prev) => [...prev.slice(-100), msg]);
  }

  // ✅ AUTH GUARD (RUN ONCE)
  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, []);

  // ✅ JOIN RTC ONCE ONLY
  useEffect(() => {
    if (!userId || rtcJoined) return;

    const joinRtc = async () => {
      try {
        const joined = await joinRoomApi(roomId);
        setRoom(joined.room as any);
        setParticipants(joined.room.participants);
        println("Joined room + got RTC token");

        if (!AgoraRTC) {
          const agora = await import("agora-rtc-sdk-ng");
          AgoraRTC = agora.default;
        }

        const client = AgoraRTC.createClient({ codec: "vp8", mode: "rtc" });
        const rtcUid = joined.token.uid;

        await client.join(
          AGORA_APP_ID,
          `room_${roomId}`,
                joined.token.token,
                 joined.token.uid
        );

        await fetch(`${API_BASE}/rooms/${roomId}/rtc-uid`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${getToken()}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ rtcUid })
});


client.on("user-published", async (user:any, mediaType:any) => {
  // ❌ Do not subscribe to yourself
  if (user.uid === client.uid) return;

  console.log("Remote user published:", user.uid);

  if (mediaType === "audio") {
    await client.subscribe(user, mediaType);
    user.audioTrack?.play();
    console.log("🔊 Playing remote audio:", user.uid);
  }
});


client.on("user-unpublished", (user:any) => {
  console.log("Remote user unpublished:", user.uid);
});

client.on("user-left", (user:any) => {
  console.log("Remote user left:", user.uid);
});



        const track = await AgoraRTC.createMicrophoneAudioTrack();
        await client.publish([track]);

        setAgoraClient(client);
        setLocalTrack(track);
        setRtcJoined(true);
        setMicOn(true);
        println("Agora joined & mic published");

      } catch (err:any) {
     console.error("AGORA ERROR:", err);
  println("Failed to join room: " + (err?.message || JSON.stringify(err)));
      } finally {
        setLoading(false);
      }
    };

    joinRtc();
  }, [rtcJoined, userId]);

  // ✅ FETCH ROOM STATUS
  useEffect(() => {
    (async () => {
      try {
        const roomData = await getRoomDetail(roomId);
        setRoom(roomData);
        setParticipants(roomData.participants);
      } catch {}
    })();
  }, [roomId]);

  // ✅ SOCKET.IO
  useEffect(() => {
    if (!userId || !API_BASE) return;

    const s = io(API_BASE, { query: { roomId, userId } });

    s.on("connect", () => {
      println("WS connected");
      s.emit("room.join", { roomId, userId });
    });

    s.onAny((event, data) => {
      println(`${event}: ${JSON.stringify(data)}`);
      if (event === "seat.update") {
  setRoom((prev) =>
    prev ? { ...prev, seats: data.seats } : prev
  );
}


      if (event === "seat.request") {
        setSeatRequests((prev) => [...prev, data.request]);
        setShowModal(true);
      }

      if (event === "room.join" || event === "room.leave") {
        if (data.participants) {
          setParticipants(data.participants);
        }
      }

      if (
        event.startsWith("seat.") ||
        event === "user.micOn" ||
        event === "user.micOff"
      ) {
        getRoomDetail(roomId)
          .then((r) => setRoom(r))
          .catch(() => {});
      }
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [API_BASE, roomId, userId]);

  // ✅ CLEAN EXIT
  useEffect(() => {
    return () => {
      try {
        setRtcJoined(false);
        localTrack?.stop();
        localTrack?.close();
        agoraClient?.leave();
        socket?.disconnect();
      } catch {}
    };
  }, []);

async function toggleMic() {
  if (!localTrack) {
    console.warn("No localTrack yet");
    return;
  }

  const next = !micOn;

  console.log("🎤 SET MIC ENABLED:", next);

  await localTrack.setEnabled(next);   // ✅ THIS is real mute/unmute

  setMicOn(next);

  socket?.emit(next ? "user.micOn" : "user.micOff", { roomId, userId });
}


  async function handleLeave() {
    try {
      await leaveSeatApi(roomId);
      await leaveRoomApi(roomId);
    } catch {}

    localTrack?.stop();
    localTrack?.close();
    await agoraClient?.leave().catch(() => {});
    socket?.emit("room.leave", { roomId, userId });
    router.push("/rooms");
  }

 async function handleRequestSeat(seatIndex: number) {
  await requestSeatApi(roomId, seatIndex);

  socket?.emit("seat.request", {
    roomId,
    userId,
    seatIndex,
  });

  println(`Requested seat ${seatIndex}`);
}


  async function approveSeat(id: string) {
    await approveSeatApi(roomId, id, true);
    setSeatRequests((r) => r.filter((x) => x.id !== id));
  }

  async function denySeat(id: string) {
    await approveSeatApi(roomId, id, false);
    setSeatRequests((r) => r.filter((x) => x.id !== id));
  }

  async function handleBan(targetId: string) {
    await banUserApi(roomId, targetId);
  }

  if (loading || !room) {
    return <div className="h-screen flex items-center justify-center">Joining...</div>;
  }

  const isHost = userId === room.hostId;

  // ✅ UI
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-white">

      {/* HEADER */}
      <header className="flex justify-between items-center px-4 py-3 border-b border-slate-800">
        <div>
          <h1 className="font-semibold">{room.name}</h1>
          <p className="text-xs text-slate-400">Host: {room.hostId}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={toggleMic} className={`btn ${micOn ? "btn-primary" : ""}`}>
            {micOn ? "Mic ON" : "Mic OFF"}
          </button>
          <button className="btn btn-danger" onClick={handleLeave}>Leave</button>
        </div>
      </header>

      {/* MAIN */}
      <main className="grid md:grid-cols-3 gap-4 p-4">

        {/* Seats */}
        <div className="md:col-span-2">
          <div className="card">
            <h2 className="font-semibold mb-2">Seats</h2>
            <SeatGrid
              seats={room.seats}
              hostId={room.hostId}
              onRequestSeat={handleRequestSeat}
            />
          </div>

          <div className="card mt-4">
            <h3 className="mb-1">Logs</h3>
            <pre className="bg-black p-2 text-xs h-40 overflow-auto">
              {log.join("\n")}
            </pre>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <UserList participants={participants} />

          {isHost && (
            <HostPanel
              participants={participants}
              onBan={handleBan}
              onMute={() => {}}
              onKick={() => {}}
            />
          )}
        </div>
      </main>

      {/* Seat approval */}
      {isHost && (
        <SeatApprovalModal
          open={showModal}
          requests={seatRequests}
          onApprove={approveSeat}
          onDeny={denySeat}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
