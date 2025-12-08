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
  RoomListItem,
} from "@/app/lib/api";
import { getCurrentUser, getToken } from "@/app/lib/auth";
import { SeatGrid } from "@/app/components/SeatGrid";
import { UserList } from "@/app/components/UserList";
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

  // Derived state helpers
  const mySeat = room?.seats?.find((s) => s.userId === userId) ?? null;
  const myParticipant = participants.find((p) => p.userId === userId) ?? null;

  // canSpeak: seat exists + seat allows mic + participant not self-muted
  const canSpeak =
    !!mySeat && mySeat.micOn === true

  const [speakers, setSpeakers] = useState<Record<string, number>>({});

  // === REFS FOR STABILITY ===
  const agoraClientRef = useRef<IAgoraRTCClient | null>(null);
  const localTrackRef = useRef<ILocalAudioTrack | null>(null);
  const rtcJoinedRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const micOnRef = useRef(false);
  const leavingRef = useRef(false);
  const hadSeatRef = useRef(false);

  function println(msg: string) {
    setLog((prev) => [...prev.slice(-200), `[${new Date().toLocaleTimeString()}] ${msg}`]);
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
      console.log("roomdatattttttttttt", roomData)
      setParticipants(roomData.participants ?? []);
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
  // RTC JOIN (production-hardened)
  // ============================
  useEffect(() => {
    if (!userId) return;
    if (rtcJoinedRef.current) return;

    let cancelled = false;

    const joinRtc = async () => {
      try {
        println("🔌 Joining RTC...");

        // joinRoomApi provides publisher/subscriber token info
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

        // join Agora
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

        // register rtc uid with backend
        await fetch(`${API_BASE}/audio-room/${roomId}/rtc-uid`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${getToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ rtcUid }),
        });

        // create microphone track (start muted)
        const track: ILocalAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        await track.setEnabled(false); // start muted

        setAgoraClient(client);
        setLocalTrack(track);
        setRtcJoined(true);
        println("✅ RTC joined, mic created (muted)");

        // subscribe to event users
        client.on("user-published", async (u: any, mediaType: any) => {
          if (u.uid === rtcUid) return;
          if (mediaType === "audio") {
            try {
              await client.subscribe(u, mediaType);
              u.audioTrack?.play();
              println(`🔊 Subscribed to remote audio: ${u.uid}`);
            } catch (e) {
              console.error("Subscribe error:", e);
              println("❌ Failed to subscribe to remote user");
            }
          }
        });

        // subscribe existing
        const remoteUsers = client.remoteUsers ?? [];
        for (const ru of remoteUsers) {
          // @ts-ignore
          if (ru.hasAudio) {
            try {
              await client.subscribe(ru, "audio");
              ru.audioTrack?.play();
            } catch (e) {
              console.error("subscribe existing error", e);
            }
          }
        }

        client.on("volume-indicator", (vols: any[]) => {
          setSpeakers((prev) => {
            const next = { ...prev };
            vols.forEach((v) => {
              if (v.level > 5) next[String(v.uid)] = v.level;
              else delete next[String(v.uid)];
            });
            return next;
          });
        });

        client.on("connection-state-change", (cur: string, prev: string) => {
          println(`🌐 RTC state: ${prev} → ${cur}`);
        });

        // token renewal
        client.on("token-privilege-will-expire", async () => {
          println("⚠️ RTC token will expire soon — renewing...");
          try {
            const renewed = await joinRoomApi(roomId);
            await client.renewToken(renewed.token.token);
            println("✅ RTC token renewed");
          } catch (e) {
            console.error("Token renewal error", e);
            println("❌ Failed to renew token");
          }
        });
      } catch (err) {
        console.error("RTC ERROR:", err);
        println("❌ Failed to join RTC: " + (err as any)?.message || "unknown");
      } finally {
        if (!cancelled) setLoadingRtc(false);
      }
    };

    joinRtc();

    return () => {
      cancelled = true;
    };
  }, [API_BASE, AGORA_APP_ID, roomId, userId]);

  // ============================
  // SOCKET.IO
  // ============================
  useEffect(() => {
    if (!userId || !API_BASE) return;
    if (socketRef.current) return;

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

    // connection lifecycle
    s.on("connect", () => {
      println("✅ WS connected");
      s.emit("room.join", { roomId, userId });
    });

    s.on("disconnect", (reason: string) => {
      println(`⚠️ WS disconnected: ${reason}`);
    });

    s.on("reconnect", () => {
      println("🔄 WS reconnected — rejoining");
      s.emit("room.join", { roomId, userId });
      refreshRoomData();
    });

    s.on("connect_error", (err: any) => {
      console.error("WS connect error:", err);
      println("❌ WS connect error: " + (err?.message || "unknown"));
    });

    // room events
    s.on("room.join", () => refreshRoomData());

    s.on("room.leave", (data: any) => {
      if (data?.userId) {
        setParticipants((prev) => prev.filter((p) => p.userId !== data.userId));
        setRoom((prev) => {
          if (!prev) return prev;
          const seats = prev.seats.map((seat) =>
            seat.userId === data.userId ? { ...seat, userId: null, user: null } : seat
          );
          return { ...prev, seats };
        });
      }
      refreshRoomData();
    });

    // seat.update: authoritative seat layout
    s.on("seat.update", async (data: { seats: Seat[] }) => {
      setRoom((prev) => (prev ? { ...prev, seats: data.seats } : prev));

      const myNewSeat = data.seats.find((s) => s.userId === userId);
      const hasSeat = !!myNewSeat && myNewSeat.mode !== "LOCKED";
      const hadSeat = hadSeatRef.current;

      const client = agoraClientRef.current;
      const track = localTrackRef.current;

      if (!client || !track) {
        // keep state updated but cannot publish yet
        hadSeatRef.current = hasSeat;
        return;
      }

      // user just got a seat
      if (hasSeat && !hadSeat) {
        println("🔍 Verifying seat then publishing (if allowed)...");
        const fresh = await getRoomDetail(roomId);
        const confirm = fresh.seats.some((s) => s.userId === userId);
        if (!confirm) {
          println("❌ Seat not yet confirmed by backend — skipping publish");
          hadSeatRef.current = hasSeat;
          return;
        }

        // Optionally backend returns token in takeSeat; attempt to renew via API
        try {
          // request publisher token for lowest-latency
          const token = await getPublisherTokenApi(roomId);
          await client.renewToken(token.token);
        } catch (e) {
          // ignore; token renewal is optional
        }

        // publish only if seat allows (but start with muted)
        if (myNewSeat && myNewSeat.micOn === true) {
          try {
            await track.setEnabled(false); // keep muted initially
            await client.publish([track]);
            // remain muted until user toggles mic
            println("🎤 Published as publisher (muted). Use mic button to unmute.");
          } catch (err) {
            console.error("Publish error after seat assign:", err);
            println("❌ Failed to publish after being assigned seat");
          }
        } else {
          // seat muted by host — don't publish
          println("🔒 Seat currently muted by host — not publishing");
        }
      }

      // user lost seat
      if (!hasSeat && hadSeat) {
        try {
          println("🛑 Seat removed → unpublish & disable local mic");
          await client.unpublish([track]);
        } catch {}
        try {
          await track.setEnabled(false);
        } catch {}
        micOnRef.current = false;
        setMicOn(false);
      }

      hadSeatRef.current = hasSeat;
    });

    // seat mute (host action) — includes seatIndex, mute(bool), userId (affected user)
    s.on("seat.mute", (payload: { seatIndex: number; mute: boolean; userId?: string }) => {
      const { seatIndex, mute, userId: affected } = payload;

      // update seats locally fast
      setRoom((prev) => {
        if (!prev) return prev;
        const seats = prev.seats.map((s) => (s.index === seatIndex ? { ...s, micOn: !mute } : s));
        return { ...prev, seats };
      });

      // update participant muted flag if participant present
      if (affected) {
        setParticipants((prev) => prev.map((p) => (p.userId === affected ? { ...p, muted: mute } : p)));
      }

      // if current user affected, enforce client-side behavior
      if (String(affected) === String(userId)) {
        const client = agoraClientRef.current;
        const track = localTrackRef.current;

        if (mute) {
          (async () => {
            if (client && track) {
              try {
                await client.unpublish([track]);
              } catch {}
            }
            if (track) {
              try {
                await track.setEnabled(false);
              } catch {}
            }

            micOnRef.current = false;
            setMicOn(false);
            println("🔇 You were muted by host (seat muted)");
          })();
        } else {
          // host unmuted the seat — user must explicitly toggle mic
          println("🔊 Host unmuted the seat — you may now unmute manually");
        }
      }
    });

    s.on("seat.request", (data: any) => {
      setSeatRequests((prev) => (prev.some((r) => r.id === data.request.id) ? prev : [...prev, data.request]));
      setShowModal(true);
    });

    s.on("user.kicked", async ({ userId: kickedId }: { userId: string }) => {
      if (String(kickedId) !== String(userId)) {
        refreshRoomData();
        return;
      }

      // If *me* was kicked, force immediate disconnect and redirect
      alert("⛔ You were kicked by the host. You cannot rejoin for 24 hours.");
      leavingRef.current = true;

      const client = agoraClientRef.current;
      const track = localTrackRef.current;
      try {
        if (track) {
          track.stop();
          track.close();
        }
      } catch {}
      try {
        if (client) await client.leave();
      } catch {}
      socketRef.current?.disconnect();
      router.push("/rooms");
    });

    s.on("user.micOn", (p: { userId: string }) => {
      setParticipants((prev) => prev.map((x) => (x.userId === p.userId ? { ...x, muted: false } : x)));
    });

    s.on("user.micOff", (p: { userId: string }) => {
      setParticipants((prev) => prev.map((x) => (x.userId === p.userId ? { ...x, muted: true } : x)));
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
  }, [API_BASE, roomId, userId, router]);

  // ============================
  // Cleanups (beforeunload & unmount)
  // ============================
  useEffect(() => {
    const handler = () => {
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
        if (client) client.leave();
      } catch {}
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [roomId, userId]);

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
        if (client) client.leave();
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
    try {
      if (mute) await muteSeatApi(roomId, seatIndex);
      else await unmuteSeatApi(roomId, seatIndex);
      // server will emit seat.update / seat.mute so UI will refresh
      setModeModalOpen(false);
    } catch (e) {
      console.error("mute seat error", e);
      println("❌ Failed to change seat mute");
    }
  }

  async function applySeatMode(mode: string) {
    if (selectedSeatIndex == null) return;
    await changeSeatModeApi(roomId, selectedSeatIndex, mode as any);
    setModeModalOpen(false);
    setSelectedSeatIndex(null);
  }

  async function toggleMic() {
    const track = localTrackRef.current;
    const client = agoraClientRef.current;
    const s = socketRef.current;
    if (!track || !client) return;

    // Seat-level guard: if seat is muted by host, do not allow unmuting
    if (!mySeat || mySeat.micOn === false) {
      println("❌ Seat is muted by host. You cannot unmute.");
      try { await track.setEnabled(false); } catch {}
      setMicOn(false);
      micOnRef.current = false;
      return;
    }

    // flip
    const next = !micOnRef.current;

    try {
      if (next) {
        // enable locally then publish
        await track.setEnabled(true);
        try {
          await client.publish([track]);
        } catch (e) {
          // publish may fail sometimes — still keep track enabled
          console.warn("publish warning", e);
        }
        setMicOn(true);
        micOnRef.current = true;
        s?.emit("user.micOn", { roomId, userId });
        println("🎤 Mic ON (published)");
      } else {
        // unpublish then disable
        try {
          await client.unpublish([track]);
        } catch {}
        await track.setEnabled(false);
        setMicOn(false);
        micOnRef.current = false;
        s?.emit("user.micOff", { roomId, userId });
        println("🔇 Mic OFF (unpublished)");
      }
    } catch (e) {
      console.error("mic toggle error", e);
      println("❌ Mic toggle failed");
    }
  }

  async function handleHostMute(targetUserId: string, mute: boolean) {
    const seat = room?.seats.find((s) => s.userId === targetUserId);
    if (!seat) {
      println("❌ No seat for that user");
      return;
    }
    try {
      await hostMuteSeatApi(roomId, seat.index, mute); // server will broadcast seat.mute
    } catch (e) {
      console.error("host mute error", e);
      println("❌ Failed to host-mute");
    }
  }

  async function handleKick(targetUserId: string) {
    if (!room) return;
    const isHost = userId === room.host.id;
    if (!isHost) {
      println("❌ Only host can kick users");
      return;
    }

    try {
      println(`🚨 Kicking user ${targetUserId}...`);
      await kickUserApi(roomId, targetUserId);

      // optimistic UI updates
      setParticipants((prev) => prev.filter((p) => p.userId !== targetUserId));
      setRoom((prev) => {
        if (!prev) return prev;
        const seats = prev.seats.map((s) => (s.userId === targetUserId ? { ...s, userId: null, user: null } : s));
        return { ...prev, seats };
      });

      if (String(targetUserId) === String(userId)) {
        // if host kicks me (shouldn't normally happen), redirect
        router.push("/rooms");
      }

      println(`✅ User ${targetUserId} kicked`);
    } catch (err) {
      console.error("Kick error", err);
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
      if (client) await client.leave();
    } catch {}
    router.push("/rooms");
  }

  async function handleSeatClick(seatIndex: number) {
    if (!room) return;
    const seat = room.seats[seatIndex];
    if (!seat) return;
    const isHost = userId === room.host.id;

    if (isHost) {
      if (seat.userId !== userId) {
        // host taking seat
        const res = await takeSeatApi(roomId, seatIndex);
        // res maybe { seats, token }
        if (res.seats) setRoom((prev) => (prev ? { ...prev, seats: res.seats } : prev));
        // if token present -> renew token quickly
        if (res.token && agoraClientRef.current) {
          try {
            await agoraClientRef.current.renewToken(res.token.token);
          } catch {}
        }
      }
      return;
    }

    if (seat.mode === "LOCKED") {
      println("❌ Seat is locked");
      return;
    }

    if (seat.mode === "FREE" && !seat.userId) {
      println(`Auto joining free seat ${seatIndex}`);
      const res = await takeSeatApi(roomId, seatIndex);
      if (res.seats) setRoom((prev) => (prev ? { ...prev, seats: res.seats } : prev));
      if (res.token && agoraClientRef.current) {
        try {
          await agoraClientRef.current.renewToken(res.token.token);
        } catch {}
      }
      return;
    }

    if (seat.mode === "REQUEST") {
      println(`Requesting seat ${seatIndex}`);
      await requestSeatApi(roomId, seatIndex);
      println("✅ Requested");
      return;
    }
  }

  async function approveSeat(id: string) {
    const res = await approveSeatApi(roomId, id, true);
    if (res.seats) setRoom((prev) => (prev ? { ...prev, seats: res.seats } : prev));
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
    return <div className="h-screen flex items-center justify-center">Joining...</div>;
  }

  const isHost = String(userId) === String(room.host?.id);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-white">
      <header className="flex justify-between items-center px-4 py-3 border-b border-slate-800">
        <div>
          <h1 className="font-semibold">{room.name}</h1>
          <p className="text-xs text-slate-400">Host: {room.host?.nickName ?? room.host?.id}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleMic}
            disabled={!canSpeak}
            className={`btn ${micOn ? "btn-primary" : ""} ${!canSpeak ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {mySeat?.micOn === false ? "Muted by Host" : micOn ? "Mic ON" : "Mic OFF"}
          </button>

          <button className="btn btn-danger" onClick={handleLeave}>
            Leave
          </button>
        </div>
      </header>

      <main className="grid md:grid-cols-3 gap-4 p-4">
        <div className="md:col-span-2">
          <div className="card">
            <h2 className="font-semibold mb-2">Seats</h2>
            <SeatGrid
              seats={room.seats}
              hostId={room.host.id}
              onRequestSeat={handleSeatClick}
              participants={participants}
              speakers={speakers}
              onClickSeatAsHost={handleHostSeatClick}
            />
          </div>

          <div className="card mt-4">
            <h3 className="mb-1">Logs</h3>
            <pre className="bg-black p-2 text-xs h-40 overflow-auto">{log.join("\n")}</pre>
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
          onMuteSeat={(idx, mute) => onMuteSeat(idx, mute)}
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
