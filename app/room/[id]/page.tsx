"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import type { IAgoraRTCClient, ILocalAudioTrack } from "agora-rtc-sdk-ng";
import {
  approveSeatApi,
  banUserApi,
  getRoomDetail,
  hostTakeSeatApi,
  joinRoomApi,
  leaveRoomApi,
  leaveSeatApi,
  Participant,
  requestSeatApi,
  RoomDetail,
  Seat,
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
  const [speakers, setSpeakers] = useState<Record<string, number>>({});

  const [agoraClient, setAgoraClient] = useState<IAgoraRTCClient | null>(null);
  const [localTrack, setLocalTrack] = useState<ILocalAudioTrack | null>(null);
  const [rtcJoined, setRtcJoined] = useState(false);

  const [seatRequests, setSeatRequests] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API as string;
  const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID as string;
  const user = getCurrentUser();
  const userId = user?.id;

  const mySeat = room?.seats?.find((s) => s.userId === userId) || null;
  const canSpeak = !!mySeat && !mySeat.locked && mySeat.userId === userId;

  function println(msg: string) {
    setLog((prev) => [...prev.slice(-100), msg]);
  }

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
        client.enableAudioVolumeIndicator();
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
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ rtcUid }),
        });

        client.on("user-published", async (user: any, mediaType: any) => {
          if (user.uid === client.uid) return;
          if (mediaType === "audio") {
            await client.subscribe(user, mediaType);
            user.audioTrack?.play();
          }
        });

        client.on("volume-indicator", (volumes: any) => {
          setSpeakers((prev) => {
            const next = { ...prev };

            volumes.forEach((v: any) => {
              if (v.level > 5) {
                next[String(v.uid)] = v.level;
              } else {
                delete next[String(v.uid)];
              }
            });

            return next;
          });
        });

        const track = await AgoraRTC.createMicrophoneAudioTrack();
        await client.publish([track]);

        setAgoraClient(client);
        setLocalTrack(track);
        setRtcJoined(true);
        setMicOn(false);
        await track.setEnabled(false);
        println("Agora joined & mic published");
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

    // THIS IS THE UPDATED PART FOR SPEED
    s.on("room.leave", (data) => {
      // 1. FAST: If we know who left, remove them visually IMMEDIATELY
      if (data?.userId) {
        // Remove from User List instantly
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
    // END OF UPDATE

    s.onAny((event, data) => {
      println(`${event}: ${JSON.stringify(data)}`);
    });

    s.on("seat.update", (data) => {
      setRoom((prev) => (prev ? { ...prev, seats: data.seats } : prev));

      const stillSeated = data.seats.some((s: Seat) => s.userId === userId);

      if (!stillSeated && localTrack) {
        // Force mute if user lost seat
        localTrack.setEnabled(false).catch(() => {});
        setMicOn(false);
        println("🛑 You are no longer on a seat. Mic disabled.");
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
  }, [API_BASE, roomId, userId]);

  // ============================
  // CLEANUP
  // ============================
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

    if (!canSpeak) {
      println("❌ You must take a seat to speak");
      await localTrack.setEnabled(false);
      setMicOn(false);
      return;
    }

    const next = !micOn;
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

  async function handleRequestSeat(seatIndex: number) {
    if (!room) return;

    const isHost = userId === room.hostId;

    if (isHost) {
      println(`HOST taking seat ${seatIndex}`);

      const res = await hostTakeSeatApi(roomId, seatIndex);

      // ✅ update UI immediately
      setRoom((prev) => (prev ? { ...prev, seats: res.seats } : prev));
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
  console.log(participants);

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
            disabled={!canSpeak}
            className={`btn ${micOn ? "btn-primary" : ""} ${
              !canSpeak ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {canSpeak ? (micOn ? "Mic ON" : "Mic OFF") : "Seat required"}
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
              onRequestSeat={handleRequestSeat}
              speakers={speakers}
              participants={participants}
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
