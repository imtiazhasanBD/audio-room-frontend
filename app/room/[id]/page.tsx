"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import type { IAgoraRTCClient, ILocalAudioTrack } from "agora-rtc-sdk-ng";
import {
  approveSeatApi,
  banUserApi,
  changeSeatModeApi,
  getKickListApi,
  getPublisherTokenApi,
  getRoomDetail,
  hostMuteSeatApi,
  hostTakeSeatApi,
  joinRoomApi,
  kickUserApi,
  leaveRoomApi,
  leaveSeatApi,
  muteSeatApi,
  Participant,
  requestSeatApi,
  RoomDetail,
  Seat,
  takeSeatApi,
  unmuteSeatApi,
} from "@/app/lib/api";
import { getCurrentUser, getToken } from "@/app/lib/auth";
import { SeatGrid } from "@/app/components/SeatGrid";
import { UserList } from "@/app/components/UserList";
import { HostPanel } from "@/app/components/HostPanel";
import SeatApprovalModal from "@/app/components/SeatApprovalModal";
import SeatModeModal from "@/app/components/SeatModeModal";
import HostModerationPanel from "@/app/components/HostModerationPanel";

// GLOBAL SINGLETON
let AgoraRTC: any = null;

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = params.id;
  const router = useRouter();

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [KickList, setKickList] = useState();
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
  const [modeModalOpen, setModeModalOpen] = useState(false);
  const [selectedSeatIndex, setSelectedSeatIndex] = useState<number | null>(
    null
  );

  const API_BASE = process.env.NEXT_PUBLIC_API as string;
  const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID as string;
  const user = getCurrentUser();
  const userId = user?.id;

  // Derived state
const mySeat = room?.seats?.find((s) => s.userId === userId) || null;
const myParticipant = participants.find((p) => p.userId === userId) || null;

// User is allowed to speak only if:
// 1) user is on a seat (mySeat)
// 2) seat allows audio (mySeat.micOn === true)
// 3) participant didn't self-mute (myParticipant?.muted === false)
const canSpeak = !!mySeat && mySeat.micOn === true ;


  const [speakers, setSpeakers] = useState<Record<string, number>>({});

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
        client.enableAudioVolumeIndicator();
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
        const track: ILocalAudioTrack =
          await AgoraRTC.createMicrophoneAudioTrack();
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

        client.on("volume-indicator", (volumes) => {
          setSpeakers((prev) => {
            const next = { ...prev };

            volumes.forEach((v) => {
              if (v.level > 5) {
                next[String(v.uid)] = v.level;
              } else {
                delete next[String(v.uid)];
              }
            });

            return next;
          });
        });

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

s.on("seat.mute", (payload) => {
  const { seatIndex, mute, userId: targetUserId } = payload;

  // Update seats
  setRoom((prev) => {
    if (!prev) return prev;
    const seats = prev.seats.map((s) =>
      s.index === seatIndex ? { ...s, micOn: !mute } : s
    );
    return { ...prev, seats };
  });

  // Update participants
  setParticipants((prev) =>
    prev.map((p) =>
      p.userId === targetUserId ? { ...p, muted: mute } : p
    )
  );

  // If this affects ME
  if (String(targetUserId) === String(user?.id)) {
    const client = agoraClientRef.current;
    const track = localTrackRef.current;

    if (mute) {
      (async () => {
        // ⭐ FIXED — only unpublish when track is valid
        if (client && track) {
          try {
            await client.unpublish([track]);
          } catch {}
        }

        // ⭐ FIXED — only disable when track exists
        if (track) {
          try {
            await track.setEnabled(false);
          } catch {}
        }

        micOnRef.current = false;
        setMicOn(false);
        println("🔇 Host muted you");
      })();
    } else {
      println("🔊 Host allowed you to speak — tap mic to unmute");
    }
  }
});



    s.on("seat.request", (data) => {
      setSeatRequests((prev) => {
        if (prev.some((r) => r.id === data.request.id)) return prev;
        return [...prev, data.request];
      });
      setShowModal(true);
    });

    // put near your other socket handlers (use same refs you already have)
    s.on("user.kicked", async ({ userId: kickedId }) => {
      if (String(kickedId) !== String(userId)) return refreshRoomData();

      alert("You were kicked by the host.");

      leavingRef.current = true;

      try {
        localTrackRef.current?.close();
      } catch {}
      try {
        await agoraClientRef.current?.leave();
      } catch {}

      socketRef.current?.disconnect();

      window.location.href = "/rooms";
    });

    s.on("user.kicked", ({ userId: kickedId }) => {
      if (kickedId === userId) {
        alert("You were kicked. Cannot rejoin for 24 hours.");
        // handleLeave();
      }
    });

    s.on("seat.mute", (data) => {
      const { seatIndex, mute, userId } = data;
      if (userId === user?.id && !mute) {
        println("🔊 Host allowed you to speak — tap mic to unmute");
      }
      // Update seat micOn
      setRoom((prev) => {
        if (!prev) return prev;

        const seats = prev.seats.map((s) =>
          s.index === seatIndex ? { ...s, micOn: !mute } : s
        );

        return { ...prev, seats };
      });

      s.on("user.kicked", async ({ userId: kickedId }) => {
        if (kickedId !== userId) {
          refreshRoomData();
          return;
        }

        alert("You were kicked by the host. You cannot rejoin for 24 hours.");

        // ---- FORCE DISCONNECT ----
        leavingRef.current = true; // stop cleanup loops

        const client = agoraClientRef.current;
        const track = localTrackRef.current;
        const sock = socketRef.current;

        try {
          if (track) {
            track.stop();
            track.close();
          }
        } catch {}

        try {
          if (client) {
            await client.leave();
          }
        } catch {}

        try {
          if (sock) {
            sock.disconnect();
          }
        } catch {}

        // Prevent socket.io reconnect
        if (sock) {
          sock.io.opts.reconnection = false;
        }

        // ---- FORCE PAGE LEAVE ----
        window.location.href = "/rooms";
      });

      // Update participant muted flag
      setParticipants((prev) =>
        prev.map((p) => (p.userId === userId ? { ...p, muted: mute } : p))
      );

      // If host muted ME, turn off my microphone
      if (userId === userId && mute) {
        localTrackRef.current?.setEnabled(false);
        setMicOn(false);
        println("🔇 Host muted you");
      }
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

  function handleHostSeatClick(seatIndex: number) {
    setSelectedSeatIndex(seatIndex);
    setModeModalOpen(true);
  }
async function onMuteSeat(seatIndex: number, mute: boolean) {
  if (mute) {
    await muteSeatApi(roomId, seatIndex);
  } else {
    await unmuteSeatApi(roomId, seatIndex);
  }
}


  async function applySeatMode(mode: string) {
    if (selectedSeatIndex == null) return;

    await changeSeatModeApi(roomId, selectedSeatIndex, mode);

    setModeModalOpen(false);
    setSelectedSeatIndex(null);
  }

async function toggleMic() {
  const track = localTrackRef.current;
  const client = agoraClientRef.current;
  const s = socketRef.current;

  if (!track || !client) return;

  // Seat-level guard
  if (!mySeat || mySeat.micOn === false) {
    println("❌ Seat is muted by host. You cannot unmute.");
    try { await track.setEnabled(false); } catch {}
    setMicOn(false);
    return;
  }

  const next = !micOnRef.current;

  try {
    if (next) {
      // enable track locally first (so browser unlocks)
      await track.setEnabled(true);
      // publish to Agora so others hear you
      await client.publish([track]);
      setMicOn(true);
      micOnRef.current = true;
      s?.emit("user.micOn", { roomId, userId });
      println("🎤 Mic enabled and published");
    } else {
      // unpublish then disable locally
      try {
        await client.unpublish([track]);
      } catch (e) {
        // ignore unpublish errors (might not be published)
      }
      await track.setEnabled(false);
      setMicOn(false);
      micOnRef.current = false;
      s?.emit("user.micOff", { roomId, userId });
      println("🔇 Mic disabled and unpublished");
    }
  } catch (e) {
    console.error("Mic toggle error", e);
    println("❌ Mic toggle failed: " + (e as any)?.message || "unknown");
  }
}


  async function handleHostMute(targetUserId: string, mute: boolean) {
    const seat = room?.seats.find((s) => s.userId === targetUserId);
    if (!seat) return;

    await hostMuteSeatApi(roomId, seat.index, mute);
  }

  async function handleKick(targetUserId: string) {
    if (!room) return;
    const isHost = userId === room.hostId;
    if (!isHost) {
      println("❌ Only host can kick users");
      return;
    }

    try {
      println(`🚨 Kicking user ${targetUserId}...`);

      await kickUserApi(roomId, targetUserId);

      // Remove user from participants immediately
      setParticipants((prev) => prev.filter((p) => p.userId !== targetUserId));

      // Also remove user from seats
      setRoom((prev) => {
        if (!prev) return prev;

        const updatedSeats = prev.seats.map((s) => {
          if (s.userId === targetUserId) {
            return { ...s, userId: null, micOn: false };
          }
          return s;
        });

        return { ...prev, seats: updatedSeats };
      });

      // If YOU are the kicked user, force redirect
      if (targetUserId === userId) {
        println("❌ You were kicked from this room");
        router.push("/rooms");
      }

      println(`✅ User ${targetUserId} kicked`);
    } catch (err: any) {
      console.error("Kick error:", err);
      println("❌ Failed to kick user");
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

    const seat = room.seats[seatIndex];
    const isHost = userId === room.hostId;
    console.log("Clicked Seatttttttttttttttttttttt:", seatIndex, seat);

    // --- HOST LOGIC ---
    if (isHost) {
      // If user clicked the settings icon, mode modal opens (handled elsewhere)
      if (seat.userId !== userId) {
        // Host taking a different seat (seat switching)
        const res = await takeSeatApi(roomId, seatIndex);
        setRoom((prev) => (prev ? { ...prev, seats: res.seats } : prev));
      }
      return;
    }

    // --- AUDIENCE LOGIC ---
    if (seat.mode === "LOCKED") {
      println("❌ Seat is locked");
      return;
    }

    if (seat.mode === "FREE" && !seat.userId) {
      // Auto join seat
      println(`Auto joining free seat ${seatIndex}`);
      await takeSeatApi(roomId, seatIndex);
      return;
    }

    if (seat.mode === "REQUEST") {
      println(`Requesting seat ${seatIndex}`);
      await requestSeatApi(roomId, seatIndex);
      return;
    }
  }

  async function approveSeat(id: string) {
    const res = await approveSeatApi(roomId, id, true);

    // update seats immediately
    setRoom((prev) => (prev ? { ...prev, seats: res.seats } : prev));

    // remove from modal list
    setSeatRequests((r) => r.filter((x) => x.id !== id));
  }

  async function denySeat(id: string) {
    const res = await approveSeatApi(roomId, id, false);
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
  className={`btn ${micOn ? 'btn-primary' : ''} ${!canSpeak ? 'opacity-50 cursor-not-allowed' : ''}`}
>
  {mySeat?.micOn === false ? 'Muted by Host' : (micOn ? 'Mic ON' : 'Mic OFF')}
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
              participants={participants}
              speakers={speakers}
              onClickSeatAsHost={handleHostSeatClick}
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
            <HostModerationPanel
              socket={socketRef.current}
              roomId={roomId}
              participants={participants}
              refreshRoom={refreshRoomData}
              onMute={handleHostMute}
              onKick={handleKick}
            />
          )}
        </div>
      </main>

      {isHost && (
        <SeatModeModal
          open={modeModalOpen}
          seatIndex={selectedSeatIndex}
          onClose={() => setModeModalOpen(false)}
          onChangeMode={applySeatMode}
          onMuteSeat={onMuteSeat}
        />
      )}

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
