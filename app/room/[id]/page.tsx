"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import type { IAgoraRTCClient, ILocalAudioTrack } from "agora-rtc-sdk-ng";
import {
  approveSeatApi,
  banUserApi,
  getPublisherTokenApi,
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


  const [seatRequests, setSeatRequests] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API as string;
  const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID as string;
  const user = getCurrentUser();
  const userId = user?.id;
  

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
               console.log("Remote user published:", user.uid);
          if (mediaType === "audio") {
            await client.subscribe(user, mediaType);
            user.audioTrack?.play();
              console.log("🔊 Playing remote audio:", user.uid)
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
            // 🔍 Check if current user has a seat now
      const hasSeat = data.seats?.some(
        (seat: any) => seat.userId === userId
      );

      // ✅ Case 1: user just got a seat → upgrade to publisher
      if (hasSeat && !isPublisher && agoraClient && localTrack) {
        (async () => {
          try {
            println("🎙 Seat granted. Requesting publisher token...");
            const token = await getPublisherTokenApi(roomId);

            // Agora rtc client supports renewToken
            // @ts-ignore
            await agoraClient.renewToken(token.token);

            await localTrack.setEnabled(true);
            // publish if not already
            // @ts-ignore
            await agoraClient.publish([localTrack]);

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

      // ❌ Case 2: user lost seat → mute & mark not publisher
      if (!hasSeat && isPublisher && localTrack && agoraClient) {
        (async () => {
          try {
            // @ts-ignore
            await agoraClient.unpublish([localTrack]);
          } catch {}
          await localTrack.setEnabled(false);
          setMicOn(false);
          setIsPublisher(false);
          println("🛑 Seat lost. Mic disabled and unpublised.");
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
  }, [API_BASE, roomId, userId, agoraClient, localTrack, isPublisher]);

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

  async function handleRequestSeat(seatIndex: number) {
    await requestSeatApi(roomId, seatIndex);
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
