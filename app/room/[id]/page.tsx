"use client";

import { useEffect, useState, useRef } from "react";
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
  const [micOn, setMicOn] = useState(false);

  const [agoraClient, setAgoraClient] = useState<IAgoraRTCClient | null>(null);
  const [localTrack, setLocalTrack] = useState<ILocalAudioTrack | null>(null);
  const [rtcJoined, setRtcJoined] = useState(false);

  const [seatRequests, setSeatRequests] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API as string;
  const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID as string;
  const user = getCurrentUser();
  const userId = user?.id;

  // Derived state
  const mySeat = room?.seats?.find((s) => s.userId === userId) || null;
  const canSpeak = !!mySeat && !mySeat.locked && mySeat.userId === userId;

  // === REFS FOR PRODUCTION HARDENING ===
  const agoraClientRef = useRef<IAgoraRTCClient | null>(null);
  const localTrackRef = useRef<ILocalAudioTrack | null>(null);
  const rtcJoinedRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const micOnRef = useRef(false);
  const leavingRef = useRef(false);
  const hadSeatRef = useRef(false);


  function println(msg: string) {
    setLog((prev) => [...prev.slice(-100), msg]);
    // Optionally also console.log:
    // console.log("[LOG]", msg);
  }

  // Keep refs in sync with state
  useEffect(() => {
    agoraClientRef.current = agoraClient;
  }, [agoraClient]);

  useEffect(() => {
    localTrackRef.current = localTrack;
  }, [localTrack]);

  useEffect(() => {
    rtcJoinedRef.current = rtcJoined;
  }, [rtcJoined]);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    micOnRef.current = micOn;
  }, [micOn]);

  // ============================
  // AUTH GUARD
  // ============================
  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, [router]);

  // ============================
  // FETCH ROOM STATE
  // ============================
  const refreshRoomData = async () => {
    try {
      const roomData = await getRoomDetail(roomId);
      setRoom(roomData);
      setParticipants(roomData.participants);
      setRoomLoaded(true);
    } catch (e) {
      console.error("Failed to refresh room", e);
      println("❌ Failed to refresh room");
    }
  };

  useEffect(() => {
    refreshRoomData();
  }, [roomId]);

  // ============================
  // RTC JOIN (PRODUCTION-HARDENED)
  // ============================
  useEffect(() => {
    if (!userId) return;
    if (rtcJoinedRef.current) return;

    let cancelled = false;

    const joinRtc = async () => {
      try {
        println("🔌 Joining RTC...");

        const joined = await joinRoomApi(roomId);

        if (!AgoraRTC) {
          const agora = await import("agora-rtc-sdk-ng");
          AgoraRTC = agora.default;
        }

        const client: IAgoraRTCClient = AgoraRTC.createClient({
          codec: "vp8",
          mode: "rtc",
        });

        const rtcUid = joined.token.uid;

        // JOIN CHANNEL
        await client.join(
          AGORA_APP_ID,
          `room_${roomId}`,
          joined.token.token,
          rtcUid
        );

        if (cancelled) {
          await client.leave();
          return;
        }

        // REGISTER RTC UID WITH BACKEND
        await fetch(`${API_BASE}/rooms/${roomId}/rtc-uid`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ rtcUid }),
        });

        // CREATE MIC IMMEDIATELY (UNLOCKS BROWSER AUDIO POLICY)
        const track: ILocalAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        await track.setEnabled(false); // Start muted

        // Save in state + refs
        setAgoraClient(client);
        setLocalTrack(track);
        setRtcJoined(true);
        setMicOn(false);
        println("✅ RTC joined, mic created (muted)");

        // === AGORA EVENT HANDLERS ===

        // Subscribe to newly published remote users
        client.on("user-published", async (user: any, mediaType: any) => {
          if (user.uid === rtcUid) return;
          if (mediaType === "audio") {
            try {
              await client.subscribe(user, mediaType);
              user.audioTrack?.play();
              println(`🔊 Subscribed to remote audio: ${user.uid}`);
            } catch (e) {
              console.error("Subscribe error:", e);
              println("❌ Failed to subscribe to remote user");
            }
          }
        });

        // Subscribe to already existing users
        const remoteUsers = client.remoteUsers;
        for (const user of remoteUsers) {
          // @ts-ignore
          if (user.hasAudio) {
            try {
              await client.subscribe(user, "audio");
              user.audioTrack?.play();
              println(`🔁 Subscribed to existing remote audio: ${user.uid}`);
            } catch (e) {
              console.error("Subscribe existing user error:", e);
            }
          }
        }

        // Connection state logging
        client.on(
          "connection-state-change",
          (curState: string, prevState: string) => {
            println(`🌐 RTC state: ${prevState} → ${curState}`);
          }
        );

        // Network quality logging
        client.on("network-quality", (stats: any) => {
          const { uplinkNetworkQuality, downlinkNetworkQuality } = stats;
          println(
            `📶 Network quality - up: ${uplinkNetworkQuality}, down: ${downlinkNetworkQuality}`
          );
        });

        // OPTIONAL: token renewal (if your tokens expire)
        client.on("token-privilege-will-expire", async () => {
          println("⚠️ RTC token will expire soon, renewing...");
          try {
            const renewed = await joinRoomApi(roomId);
            await client.renewToken(renewed.token.token);
            println("✅ RTC token renewed");
          } catch (e) {
            console.error("Failed to renew token:", e);
            println("❌ Failed to renew RTC token");
          }
        });

        client.on("token-privilege-did-expire", () => {
          println("❌ RTC token expired");
          // You may want to force a full reconnect here in future.
        });
      } catch (err) {
        console.error("RTC ERROR:", err);
        println("❌ Failed to join RTC: " + (err as any)?.message || "unknown");
      } finally {
        if (!cancelled) {
          setLoadingRtc(false);
        }
      }
    };

    joinRtc();

    return () => {
      cancelled = true;
    };
  }, [API_BASE, AGORA_APP_ID, roomId, userId]);

  // ============================
  // SOCKET.IO (PRODUCTION-HARDENED)
  // ============================
  useEffect(() => {
    if (!userId || !API_BASE) return;
    if (socketRef.current) return; // avoid double connect (StrictMode)

    println("🔌 Connecting WebSocket...");

    const s = io(API_BASE, {
      auth: { token: getToken() },
      query: { roomId, userId },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });

    s.on("connect", () => {
      println("✅ WS connected");
      s.emit("room.join", { roomId, userId });
    });

    s.on("disconnect", (reason) => {
      println(`⚠️ WS disconnected: ${reason}`);
    });

    s.on("reconnect_attempt", (attempt) => {
      println(`🔄 WS reconnect attempt #${attempt}`);
    });

    s.on("reconnect", () => {
      println("✅ WS reconnected, rejoining room...");
      s.emit("room.join", { roomId, userId });
      refreshRoomData();
    });

    s.on("connect_error", (err) => {
      console.error("WS connect error:", err);
      println("❌ WS connect error: " + (err as any)?.message || "unknown");
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

s.on("seat.update", async (data) => {
  setRoom(prev => prev ? { ...prev, seats: data.seats } : prev);

  const hasSeat = data.seats.some((s: Seat) => s.userId === userId);
  const hadSeat = hadSeatRef.current;

  const client = agoraClientRef.current;
  const track = localTrackRef.current;

  if (!client || !track) return;

  // ✅ USER JUST RECEIVED SEAT
  if (hasSeat && !hadSeat) {
    try {
      println("🪑 Seat granted → upgrading to publisher");

      const token = await getPublisherTokenApi(roomId);
      await client.renewToken(token.token);

      await track.setEnabled(true);
      await client.publish([track]);

      micOnRef.current = true;
      setMicOn(true);

      println("✅ Publisher enabled (mic ON due to new seat)");
    } catch (e: any) {
      console.error("Upgrade failed:", e);
      println("❌ Failed to become publisher: " + e?.message);
    }
  }

  // ✅ USER JUST LOST SEAT
  if (!hasSeat && hadSeat) {
    try {
      println("🛑 Seat removed → unpublishing mic");

      await client.unpublish([track]);
      await track.setEnabled(false);

      micOnRef.current = false;
      setMicOn(false);
    } catch {}
  }

  // ✅ REMEMBER CURRENT SEAT STATE
  hadSeatRef.current = hasSeat;
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

    s.onAny((event, data) => {
      println(`${event}: ${JSON.stringify(data)}`);
    });

    setSocket(s);
    socketRef.current = s;

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [API_BASE, roomId, userId]);

  // ============================
  // PAGE / TAB LIFECYCLE CLEANUP
  // ============================
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (leavingRef.current) return;
      leavingRef.current = true;

      try {
        const s = socketRef.current;
        if (s) {
          s.emit("room.leave", { roomId, userId });
          s.disconnect();
        }

        const client = agoraClientRef.current;
        const track = localTrackRef.current;

        if (track) {
          track.stop();
          track.close();
        }

        if (client) {
          client.leave();
        }
      } catch {}
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [roomId, userId]);

  // COMPONENT UNMOUNT CLEANUP
  useEffect(() => {
    return () => {
      try {
        leavingRef.current = true;

        const s = socketRef.current;
        if (s) {
          s.emit("room.leave", { roomId, userId });
          s.disconnect();
        }

        const client = agoraClientRef.current;
        const track = localTrackRef.current;

        if (track) {
          track.stop();
          track.close();
        }

        if (client) {
          client.leave();
        }
      } catch {}
    };
  }, [roomId, userId]);

  // ============================
  // ACTIONS
  // ============================
  async function toggleMic() {
    const track = localTrackRef.current;
    const s = socketRef.current;

    if (!track) return;

    if (!canSpeak) {
      println("❌ You must take a seat to speak");
      await track.setEnabled(false);
      setMicOn(false);
      return;
    }

    const next = !micOnRef.current;
    try {
      await track.setEnabled(next);
      setMicOn(next);
      s?.emit(next ? "user.micOn" : "user.micOff", { roomId, userId });
    } catch (e) {
      console.error("Mic toggle error:", e);
      println("❌ Failed to toggle mic");
    }
  }

  async function handleLeave() {
    if (leavingRef.current) return;
    leavingRef.current = true;

    try {
      await leaveSeatApi(roomId);
      await leaveRoomApi(roomId);
    } catch {}

    try {
      const s = socketRef.current;
      if (s) {
        s.emit("room.leave", { roomId, userId });
        s.disconnect();
      }

      const client = agoraClientRef.current;
      const track = localTrackRef.current;

      if (track) {
        track.stop();
        track.close();
      }

      if (client) {
        await client.leave();
      }
    } catch {}

    router.push("/rooms");
  }

  async function handleSeatClick(seatIndex: number) {
    if (!room) return;

    const isHost = userId === room.hostId;

    if (isHost) {
      println(`HOST taking seat ${seatIndex}`);
      const res = await hostTakeSeatApi(roomId, seatIndex);
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
