"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import type { IAgoraRTCClient, ILocalAudioTrack } from "agora-rtc-sdk-ng";
import {
  approveSeatApi,
  banUserApi,
  getPublisherTokenApi,
  getRoomDetail,
  hostTakeSeatApi,
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

// GLOBAL SINGLETON
let AgoraRTC: any = null;

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = params.id;
  const router = useRouter();

  

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const [loadingRtc, setLoadingRtc] = useState(true);
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [micOn, setMicOn] = useState(true);

  const [agoraClient, setAgoraClient] = useState<IAgoraRTCClient | null>(null);
  const [localTrack, setLocalTrack] = useState<ILocalAudioTrack | null>(null);
  const [rtcJoined, setRtcJoined] = useState(false);
  const [isPublisher, setIsPublisher] = useState(false);
// 🔁 Refs to always hold the latest values for socket callbacks
const agoraClientRef = useRef<IAgoraRTCClient | null>(null);
const localTrackRef = useRef<ILocalAudioTrack | null>(null);
const isPublisherRef = useRef(false);

  const [seatRequests, setSeatRequests] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API as string;
  const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID as string;
  const user = getCurrentUser();
  const userId = user?.id;
  

  function println(msg: string) {
    setLog((prev) => [...prev.slice(-100), msg]);
  }

  useEffect(() => {
  agoraClientRef.current = agoraClient;
}, [agoraClient]);

useEffect(() => {
  localTrackRef.current = localTrack;
}, [localTrack]);

useEffect(() => {
  isPublisherRef.current = isPublisher;
}, [isPublisher]);


  // ============================
  // AUTH GUARD
  // ============================
  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, []);

  // ============================
  // FETCH ROOM STATE
  // ============================
  // Helper function to refresh data safely
  const refreshRoomData = async () => {
    try {
      const roomData = await getRoomDetail(roomId);
      setRoom(roomData);
      setParticipants(roomData.participants);
      setRoomLoaded(true);
    } catch (e) {
      console.error("Failed to refresh room", e);
    }
  };

  useEffect(() => {
    refreshRoomData();
  }, [roomId]);

  // ============================
  // RTC JOIN
  // ============================
useEffect(() => {
  if (!userId || rtcJoined) return;

  const joinRtc = async () => {
    try {
      const joined = await joinRoomApi(roomId);

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
        rtcUid
      );

      // ✅ FIX: Subscribe to already published users on join
const remoteUsers = client.remoteUsers;

for (const user of remoteUsers) {
  console.log("🔁 Subscribing to existing user:", user.uid);

  if (user.hasAudio) {
    await client.subscribe(user, "audio");
    user.audioTrack?.play();
    console.log("✅ Audio recovered for:", user.uid);
  }
}


      await fetch(`${API_BASE}/rooms/${roomId}/rtc-uid`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rtcUid }),
      });

      client.on("user-published", async (user: any, mediaType: any) => {
        if (user.uid === client.uid) return;
        console.log("Remote user published:", user.uid);
        await client.subscribe(user, mediaType);
        if (mediaType === "audio") {
          user.audioTrack?.play();
          console.log("🔊 Playing remote audio:", user.uid);
        }
      });

      client.on("user-unpublished", (user: any) => {
        console.log("Remote user unpublished:", user.uid);
      });

      client.on("user-left", (user: any) => {
        console.log("Remote user left:", user.uid);
      });

      const track = await AgoraRTC.createMicrophoneAudioTrack();
      await track.setEnabled(false);

      setAgoraClient(client);
      setLocalTrack(track);
      setRtcJoined(true);
      setMicOn(false);
      setIsPublisher(false);
      println("Agora joined as audience (subscriber)");
    } catch (err) {
      console.error("RTC ERROR:", err);
      println("Failed to join room: " + (err || JSON.stringify(err)));
    } finally {
      setLoadingRtc(false);
    }
  };

  joinRtc();
}, [rtcJoined, userId]);


  // ============================
  // SOCKET.IO (OPTIMIZED FOR SPEED)
  // ============================
useEffect(() => {
  if (!userId || !API_BASE) return;

  const s = io(API_BASE, {
    auth: { token: getToken() },
    query: { roomId, userId },
  });

  s.on("connect", () => {
    println("WS connected");
    s.emit("room.join", { roomId, userId });
  });

  s.on("room.join", () => {
    refreshRoomData();
  });

  s.on("room.leave", (data) => {
    if (data?.userId) {
      setParticipants((prev) => prev.filter((p) => p.userId !== data.userId));

      setRoom((prev) => {
        if (!prev) return null;

        const newSeats = prev.seats.map((seat) => {
          if (seat.userId === data.userId) {
            return { ...seat, userId: null, user: null, isMuted: false };
          }
          return seat;
        });

        return { ...prev, seats: newSeats as any };
      });
    }
    refreshRoomData();
  });

  s.onAny((event, data) => {
    println(`${event}: ${JSON.stringify(data)}`);
  });

s.on("seat.update", (data) => {
  // 1️⃣ Update room seats
  setRoom((prev) => (prev ? { ...prev, seats: data.seats } : prev));

  // 2️⃣ Determine if *this* user has a seat
  const hasSeat = data.seats?.some(
    (seat: any) => seat.userId === userId
  );

  const client = agoraClientRef.current;
  const track = localTrackRef.current;
  const currentlyPublisher = isPublisherRef.current;

  // 3️⃣ Case 1: user just got a seat → become publisher
  if (hasSeat && !currentlyPublisher && client && track) {
    (async () => {
      try {
        println("🎙 Seat granted. Requesting publisher token...");
        const token = await getPublisherTokenApi(roomId);

        // @ts-ignore
        await client.renewToken(token.token);

        await track.setEnabled(true);
        // @ts-ignore
        await client.publish([track]);

        setMicOn(true);
        setIsPublisher(true);
        println("✅ Upgraded to publisher. Mic live.");
      } catch (e: any) {
        console.error("Failed to upgrade to publisher:", e);
        println(
          "Failed to upgrade to publisher: " +
            (e?.message || JSON.stringify(e))
        );
      }
    })();
  }

  // 4️⃣ Case 2: user lost seat → unpublish & mute
  if (!hasSeat && currentlyPublisher && client && track) {
    (async () => {
      try {
        // @ts-ignore
        await client.unpublish([track]);
      } catch (e) {
        console.warn("Unpublish error (safe to ignore):", e);
      }
      await track.setEnabled(false);
      setMicOn(false);
      setIsPublisher(false);
      println("🛑 Seat lost. Mic disabled and unpublished.");
    })();
  }
});


  s.on("seat.request", (data) => {
    setSeatRequests((prev) => {
      if (prev.some((r) => r.id === data.request.id)) return prev;
      return [...prev, data.request];
    });
    setShowModal(true);
  });

  s.on("user.micOn", (payload) => {
    setParticipants((prev) =>
      prev.map((p) =>
        p.userId === payload.userId ? { ...p, muted: false } : p
      )
    );
  });

  s.on("user.micOff", (payload) => {
    setParticipants((prev) =>
      prev.map((p) =>
        p.userId === payload.userId ? { ...p, muted: true } : p
      )
    );
  });

  setSocket(s);

  return () => {
    s.disconnect();
  };
}, [API_BASE, roomId, userId]); // 🔥 ONLY THESE





  // ============================
  // CLEANUP
  // ============================

  useEffect(() => {
  const beforeUnload = () => {
    socket?.emit("room.leave", { roomId, userId });
  };

  window.addEventListener("beforeunload", beforeUnload);

  return () => window.removeEventListener("beforeunload", beforeUnload);
}, [socket]);


  useEffect(() => {
    return () => {
      try {
        localTrack?.stop();
        localTrack?.close();
        agoraClient?.leave();
        socket?.disconnect();
      } catch {}
    };
  }, []);

  // ============================
  // ACTIONS
  // ============================
async function toggleMic() {
  if (!localTrack) return;
  const next = !micOn;
  console.log("🎤 SET MIC ENABLED:", next);
  await localTrack.setEnabled(next);
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


async function handleSeatClick(seatIndex: number) {
  if (!room) return;

  const isHost = userId === room.hostId;

  if (isHost) {
    println(`HOST taking seat ${seatIndex}`);

    const res = await hostTakeSeatApi(roomId, seatIndex);

    // ✅ update UI immediately
    setRoom((prev) =>
      prev ? { ...prev, seats: res.seats } : prev
    );

  } else {
    println(`USER requesting seat ${seatIndex}`);
    await requestSeatApi(roomId, seatIndex);
  }
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
    // Refresh to update list immediately after ban
    refreshRoomData();
  }

  if (!roomLoaded || loadingRtc || !room) {
    return (
      <div className="h-screen flex items-center justify-center">
        Joining...
      </div>
    );
  }

  const isHost = userId === room.hostId;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-white">
      {/* HEADER */}
      <header className="flex justify-between items-center px-4 py-3 border-b border-slate-800">
        <div>
          <h1 className="font-semibold">{room.name}</h1>
          <p className="text-xs text-slate-400">Host: {room.hostId}</p>
        </div>
        <div className="flex gap-2">
    <button
  onClick={toggleMic}
  disabled={!room?.seats?.some(s => s.userId === userId)}
  className={`btn ${micOn ? "btn-primary" : ""} ${
    !room?.seats?.some(s => s.userId === userId) ? "opacity-50 cursor-not-allowed" : ""
  }`}
>
  {micOn ? "Mic ON" : "Mic OFF"}
</button>

          <button className="btn btn-danger" onClick={handleLeave}>
            Leave
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="grid md:grid-cols-3 gap-4 p-4">
        <div className="md:col-span-2">
          <div className="card">
            <h2 className="font-semibold mb-2">Seats</h2>
            <SeatGrid
              seats={room.seats}
              hostId={room.hostId}
              onRequestSeat={handleSeatClick}
            />
          </div>
          <div className="card mt-4">
            <h3 className="mb-1">Logs</h3>

            <pre className="bg-black p-2 text-xs h-40 overflow-auto">
              {log.join("\n")}
            </pre>
          </div>
        </div>

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