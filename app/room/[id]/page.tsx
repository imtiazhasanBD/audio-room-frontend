"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import {
  Participant,
  Seat,
  RoomDetail,
  joinRoomApi,
  getRoomDetail,
  requestSeatApi,
  takeSeatApi,
  leaveSeatApi,
  leaveRoomApi,
  hostMuteSeatApi,
  muteSeatApi,
  unmuteSeatApi,
  approveSeatApi,
  kickUserApi,
  updateSeatCountApi,
  bulkSeatModeApi,
  changeSeatModeApi,
  leaveSeatOnly,
  chatMode,
} from "@/app/lib/api";

import { getCurrentUser, getToken } from "@/app/lib/auth";

import { UserList } from "@/app/components/UserList";
import SeatApprovalModal from "@/app/components/SeatApprovalModal";
import SeatModeModal from "@/app/components/SeatModeModal";
import HostModerationPanel from "@/app/components/HostModerationPanel";
import { IAgoraRTCClient, ILocalAudioTrack } from "agora-rtc-sdk-ng";
import { SeatGrid } from "@/app/components/SeatGrid";
import SeatInviteModal from "@/app/components/SeatInviteModal";
import RoomPinModal from "@/app/components/RoomPinModal";
import ChatBox from "@/app/components/ChatBox";

// -----------------------
// Agora singleton loader
// -----------------------
let AgoraRTC: any = null;

/* ======================================================
   🔊 AUDIO PLAYBACK FIX HELPERS (CRITICAL)
====================================================== */
async function resumeAudioContext() {
  const ctx = (window as any).AgoraRTC?.getAudioContext?.();
  if (ctx && ctx.state === "suspended") {
    await ctx.resume();
  }
}

async function ensureAudioPlayback(client: IAgoraRTCClient) {
  await resumeAudioContext();

  client.remoteUsers.forEach((user) => {
    if (user.hasAudio && user.audioTrack) {
      try {
        user.audioTrack.play();
      } catch (e) {
        console.warn("Audio play failed", e);
      }
    }
  });
}
async function subscribeAll(client: IAgoraRTCClient) {
  for (const user of client.remoteUsers) {
    if (user.hasAudio) {
      await client.subscribe(user, "audio");
    }
  }
  await ensureAudioPlayback(client);
}

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const roomId = params.id;

  const user = getCurrentUser();
  const userId = user?.id;

  const AGORA_APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID!;
  const API_BASE = process.env.NEXT_PUBLIC_API!;

  // -----------------------
  // STATE (Fully typed)
  // -----------------------
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [chatMode, setChatMode] = useState<chatMode | null>(
    room?.chatMode ?? null
  );

  const [loadingRtc, setLoadingRtc] = useState(true);
  const [roomLoaded, setRoomLoaded] = useState(false);

  const [agoraClient, setAgoraClient] = useState<IAgoraRTCClient | null>(null);
  const [localTrack, setLocalTrack] = useState<ILocalAudioTrack | null>(null);
  const [rtcJoined, setRtcJoined] = useState(false);
  const [micOn, setMicOn] = useState(true);

  const [seatRequests, setSeatRequests] = useState<any[]>([]);
  const [modeModalOpen, setModeModalOpen] = useState(false);
  const [seatApprovalOpen, setSeatApprovalOpen] = useState(false);
  const [selectedSeatIndex, setSelectedSeatIndex] = useState<number | null>(
    null
  );
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinError, setPinError] = useState("");

  const [hostRemoveSeatUser, setHostRemoveSeatUser] = useState<any>(null);

  const [invite, setInvite] = useState<{
    roomId: string;
    seatIndex: number;
  } | null>(null);

  const [speakers, setSpeakers] = useState<Record<string, number>>({});

  // -----------------------
  // REFS (for stability)
  // -----------------------

  const trackRef = useRef<ILocalAudioTrack | null>(null);
  const rtcJoinedRef = useRef(false);
  const micOnRef = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const leavingRef = useRef(false);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const publishedRef = useRef(false); // audio published?
  const opLockRef = useRef(false);

  const rtcOpLockRef = useRef(false);

  const println = (m: string) =>
    setLog((prev) => [
      ...prev.slice(-180),
      `[${new Date().toLocaleTimeString()}] ${m}`,
    ]);

  // sync refs
  useEffect(() => {
    clientRef.current = agoraClient;
  }, [agoraClient]);

  useEffect(() => {
    trackRef.current = localTrack;
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

  // -----------------------
  // AUTH GUARD
  // -----------------------
  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, []);

  // -----------------------
  // FETCH ROOM
  // -----------------------
  async function refreshRoomData() {
    try {
      const data = await getRoomDetail(roomId);
      setRoom(data);
      setParticipants(data.participants);
      setRoomLoaded(true);
    } catch (e) {
      console.error("refreshRoom error", e);
      println("❌ refreshRoom failed");
    }
  }

  useEffect(() => {
    refreshRoomData();
  }, [roomId]);

  // -----------------------
  // small sleep helper
  // -----------------------
  /* ======================================================
     SAFE OP LOCK
  ====================================================== */
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function safe(fn: () => Promise<void>) {
    while (opLockRef.current) await sleep(20);
    opLockRef.current = true;
    try {
      await fn();
    } finally {
      opLockRef.current = false;
    }
  }

  // -----------------------
  // Safe global Agora op lock
  // -----------------------
  async function safeAgoraOp<T>(fn: () => Promise<T>): Promise<T> {
    while (rtcOpLockRef.current) await sleep(40);
    rtcOpLockRef.current = true;

    try {
      const res = await fn();
      await sleep(10);
      return res;
    } finally {
      rtcOpLockRef.current = false;
    }
  }
  async function attemptJoinRoom(pin?: string) {
    try {
      const res = await joinRoomApi(roomId, pin);
      // success
      setRoom(res.room);
      setParticipants(res.room.participants);
      setRoomLoaded(true);

      return res;
    } catch (err: any) {
      const message = err?.response;
      console.log("message", message);
      if (message === "ROOM_LOCKED" || message === "ROOM_PIN_REQUIRED") {
        setShowPinModal(true);
        setPinError("");
        return null;
      }

      if (message === "INVALID_ROOM_PIN") {
        setPinError("Invalid PIN. Please try again.");
        setShowPinModal(true);
        return null;
      }

      throw err; // real error
    }
  }
  useEffect(() => {
    if (!socket) return;

    const onModeChanged = ({ mode }: { mode: chatMode }) => {
      setChatMode(mode); // ✅ LIVE UPDATE
    };

    socket.on("chat:modeChanged", onModeChanged);

    return () => {
      socket.off("chat:modeChanged", onModeChanged);
    };
  }, [socket]);
  // -----------------------
  // Agora JOIN FLOW
  // -----------------------
  useEffect(() => {
    if (!userId || clientRef.current) return;

    let unmounted = false;

    const joinAgora = async () => {
      try {
        const joined = await attemptJoinRoom();
        if (!joined) return; // room locked → wait for PIN

        if (unmounted) return;

        setRoom(joined.room);
        setParticipants(joined.room.participants);
        setRoomLoaded(true);

        if (!AgoraRTC) {
          const mod = await import("agora-rtc-sdk-ng");
          AgoraRTC = mod.default;
          (window as any).AgoraRTC = AgoraRTC;
        }

        const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
        await client.setClientRole("audience");

        clientRef.current = client;
        setAgoraClient(client);

        await client.join(
          AGORA_APP_ID,
          `room_${roomId}`,
          joined.token.token || null,
          joined.token.uid
        );
        await subscribeAll(client);
        let mic = trackRef.current;
        if (!mic) {
          mic = await AgoraRTC.createMicrophoneAudioTrack();
          trackRef.current = mic;
        }

        mic?.setMuted(true);
        setLocalTrack(mic);
        trackRef.current = mic;

        println("🎧 Joined Agora");

        client.on("user-published", async (user: any, type: any) => {
          if (type !== "audio") return;
          await client.subscribe(user, "audio");
          ensureAudioPlayback(client);
        });

        client.on("user-joined", async () => {
          await subscribeAll(client);
        });

        client.on("user-left", () => ensureAudioPlayback(client));

        client.enableAudioVolumeIndicator();
        client.on("volume-indicator", (levels: any) => {
          setSpeakers((prev) => {
            const next = { ...prev };
            levels.forEach((l: any) =>
              l.level > 5 ? (next[l.uid] = l.level) : delete next[l.uid]
            );
            return next;
          });
        });

        ensureAudioPlayback(client);
      } catch (e) {
        console.error(e);
        println("❌ Agora join failed");
      } finally {
        if (!unmounted) setLoadingRtc(false);
      }
    };

    joinAgora();

    return () => {
      unmounted = true;
      trackRef.current?.stop();
      trackRef.current?.close();
      clientRef.current?.leave();
      clientRef.current = null;
    };
  }, [roomId, userId]);

  // -----------------------
  // Mic Toggle (Option A)
  // -----------------------
  async function toggleMic() {
    const client = clientRef.current;
    const track = trackRef.current;
    if (!client || !track) return;

    const mySeat = room?.seats.find((s) => s.userId === userId);
    if (!mySeat || mySeat.micOn === false) return;

    if (micOn) {
      if (!publishedRef.current) {
        await safe(async () => {
          await client.setClientRole("host");

          await client.publish([track]);
          publishedRef.current = true;
        });
      }
      await track.setMuted(false);
      setMicOn(false);
      socket?.emit("user.micOn", { roomId, userId });
    } else {
      await track.setMuted(true);
      setMicOn(true);
      socket?.emit("user.micOff", { roomId, userId });
    }
  }

  // -----------------------
  // Next part (Seat logic + Socket + UI)
  // -----------------------

  // ============================
  // SEAT ACTIONS
  // ============================
  async function handleSeatClick(index: number) {
    if (!room) return;
    const seat = room.seats[index];
    const isHost = userId === room.host.id;

    // Host taking seat
    if (isHost) {
      const res = await takeSeatApi(roomId, index);
      if (res.seats) {
        setRoom((prev) => (prev ? { ...prev, seats: res.seats } : prev));
      }
      if (res.token && clientRef.current) {
        await safeAgoraOp(async () => {
          await clientRef.current!.renewToken(res.token.token);
          await sleep(80);
        });
      }
      return;
    }

    if (seat.mode === "LOCKED") {
      println("❌ Seat locked");
      return;
    }

    // Free mode → join instantly
    if (seat.mode === "FREE" && !seat.userId) {
      println(`🎉 Taking free seat ${index}`);
      const res = await takeSeatApi(roomId, index);
      if (res.seats)
        setRoom((prev) => (prev ? { ...prev, seats: res.seats } : prev));

      if (res.token && clientRef.current) {
        await safeAgoraOp(async () => {
          await clientRef.current!.renewToken(res.token.token);
          await sleep(80);
        });
      }
      return;
    }

    // Request mode
    if (seat.mode === "REQUEST") {
      println(`📨 Requesting seat ${index}`);
      await requestSeatApi(roomId, index);
      println("Request sent");
    }
  }

  // ============================
  // Host Mute / Kick
  // ============================

  async function handleKick(targetUser: string) {
    const isHost = room?.host.id === userId;
    if (!isHost) return;

    try {
      await kickUserApi(roomId, targetUser);

      // local update
      setParticipants((p) => p.filter((x) => x.userId !== targetUser));
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              seats: prev.seats.map((s) =>
                s.userId === targetUser ? { ...s, userId: null, user: null } : s
              ),
            }
          : prev
      );

      println("🚨 User kicked");
    } catch {
      println("❌ Kick failed");
    }
  }

  async function acceptInvite() {
    if (!invite) return;

    try {
      // take seat via API (same as clicking seat)
      //  await takeSeatApi(invite.roomId, invite.seatIndex);

      socketRef.current?.emit("seat.invite.accept", {
        roomId: invite.roomId,
        seatIndex: invite.seatIndex,
        userId,
      });
    } finally {
      setInvite(null);
    }
  }

  function rejectInvite() {
    if (!invite) return;

    socketRef.current?.emit("seat.invite.reject", {
      roomId: invite.roomId,
      seatIndex: invite.seatIndex,
      userId,
    });

    setInvite(null);
  }

  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;

    s.on("seat.invite", (data) => {
      setInvite(data);
    });

    return () => {
      s.off("seat.invite");
    };
  }, []);

  // ============================
  // Leave Room
  // ============================
  async function handleLeave() {
    if (leavingRef.current) return;
    leavingRef.current = true;

    try {
      await leaveSeatApi(roomId);
    } catch {}
    try {
      await leaveRoomApi(roomId);
    } catch {}

    // cleanup
    const s = socketRef.current;
    const client = clientRef.current;
    const track = trackRef.current;

    try {
      s?.emit("room.leave", { roomId, userId });
      s?.disconnect();
    } catch {}

    try {
      if (track) {
        try {
          if (publishedRef.current && client) {
            await client.unpublish([track]);
          }
        } catch {}
        track.stop();
        track.close();
      }
    } catch {}

    try {
      await client?.leave();
    } catch {}

    router.push("/rooms");
  }

  // ============================
  // SOCKET.IO CONNECT
  // ============================

  useEffect(() => {
    if (!API_BASE || !userId) return;
    if (socketRef.current) return;

    println("🔌 Connecting WS...");

    const s = io(API_BASE, {
      auth: { token: getToken() },
      query: { roomId, userId },
      transports: ["websocket"],
    });

    s.on("disconnect", (r) => println(`⚠ WS disconnected: ${r}`));

    s.on("participant.update", ( {participants} ) => {
      setParticipants(participants);
      console.log("participant update", participants);
    });

    s.on("seat.requests", ({ requests }) => {
      console.log("seat-request", requests);
      setSeatRequests(requests); // authoritative overwrite
      setSeatApprovalOpen(true);
    });

    // s.on("room.leave", refreshRoomData);
    // s.on("room.leave", refreshRoomData);

    // Seat Updated from host
    s.on("seat.update", (data: { seats: Seat[] }) => {
      console.log("updateddd", data);
      setRoom((prev) => (prev ? { ...prev, seats: data.seats } : prev));
    });

    // Someone turned mic ON/OFF
    s.on("user.micOn", ({ userId: target }) => {
      setParticipants((p) =>
        p.map((x) => (x.userId === target ? { ...x, muted: false } : x))
      );
    });

    s.on("user.micOff", ({ userId: target }) => {
      setParticipants((p) =>
        p.map((x) => (x.userId === target ? { ...x, muted: true } : x))
      );
    });

    // Seat request
    // s.on("seat.request", ({ request }) => {
    //   setSeatRequests((prev) =>
    //     prev.some((x) => x.id === request.id) ? prev : [...prev, request]
    //   );
    //   setSeatApprovalOpen(true);
    // });
    s.on("seat.invited", (data) => {
      console.log("invited data", data);
      setInvite(data);
    });

    // Kicked
    s.on("user.kicked", ({ userId: kicked }) => {
      if (String(kicked) !== String(userId)) return;

      alert("⛔ You were kicked.");
      handleLeave();
    });

    s.onAny((ev, data) => {
      println(`${ev}: ${JSON.stringify(data)}`);
    });

    setSocket(s);
    socketRef.current = s;

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [API_BASE, roomId, userId]);

  // ============================
  // Cleanup before unload
  // ============================
  useEffect(() => {
    const handle = () => handleLeave();
    window.addEventListener("beforeunload", handle);
    return () => window.removeEventListener("beforeunload", handle);
  }, []);

  // ============================
  // Seat Mode Change (Host)
  // ============================
  async function applySeatMode(mode: string) {
    if (selectedSeatIndex == null) return;
    await changeSeatModeApi(roomId, selectedSeatIndex, mode as any);
    setSelectedSeatIndex(null);
    setModeModalOpen(false);
    refreshRoomData();
  }

  async function applyBulkSeatMode(mode: string) {
    await bulkSeatModeApi(roomId, mode as any);
    refreshRoomData();
  }

  async function updateSeatCount(count: number) {
    try {
      const res = await updateSeatCountApi(roomId, count);
      setRoom((prev) => (prev ? { ...prev, seats: res.seats } : prev));
    } catch {
      println("❌ Failed to update seat count");
    }
  }

  async function approveSeat(id: string) {
    const r = await approveSeatApi(roomId, id, true);
    if (r.seats) setRoom((prev) => (prev ? { ...prev, seats: r.seats } : prev));
    setSeatRequests((s) => s.filter((x) => x.id !== id));
  }

  async function denySeat(id: string) {
    await approveSeatApi(roomId, id, false);
    setSeatRequests((s) => s.filter((x) => x.id !== id));
  }
  async function leaveOnlySeat() {
    try {
      await leaveSeatOnly(roomId);

      // Unpublish mic locally
      const client = clientRef.current;
      const track = trackRef.current;

      if (client && track) {
        try {
          await client.unpublish([track]);
        } catch {}
        try {
          await track.setEnabled(false);
        } catch {}

        setMicOn(false);
        micOnRef.current = false;
      }

      println("🪑 You left your seat → audience mode");
    } catch (e) {
      println("❌ seat leave failed");
    }
  }

  async function removeUserFromSeat(userId: any) {
    setHostRemoveSeatUser(userId);
    // setModeModalOpen(false);
  }

  useEffect(() => {
    const unlock = () => {
      const client = clientRef.current;
      if (client) ensureAudioPlayback(client);
    };

    window.addEventListener("click", unlock);
    window.addEventListener("touchstart", unlock);

    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  // ============================
  // RENDER
  // ============================
  if (!roomLoaded || loadingRtc || !room) {
    return (
      <div className="h-screen flex items-center justify-center text-white">
        Joining room...
      </div>
    );
  }

  const mySeat = room.seats.find((s) => s.userId === userId) ?? null;
  const canSpeak = !!mySeat && mySeat.micOn === true;
  const isHost = String(userId) === String(room.host.id);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-white">
      {/* HEADER */}
      <header className="flex justify-between items-center px-4 py-3 border-b border-slate-800">
        <div>
          <h1 className="font-semibold">{room.name}</h1>
          <p className="text-xs text-slate-400">Host: {room.host.nickName}</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={toggleMic}
            disabled={!canSpeak}
            className={`btn ${!micOn ? "btn-primary" : ""} ${
              !canSpeak ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {mySeat?.micOn === false
              ? "Muted by Host"
              : !micOn
              ? "Mic ON"
              : "Mic OFF"}
          </button>
          {mySeat && (
            <button className="btn btn-secondary" onClick={leaveOnlySeat}>
              Leave Seat
            </button>
          )}

          <button className="btn btn-danger" onClick={handleLeave}>
            Leave
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="grid md:grid-cols-3 gap-4 p-4">
        {/* LEFT: Seats + logs */}
        <div className="md:col-span-2 space-y-4">
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-700 pb-4 mb-4">
              <h2 className="text-lg font-bold">Seats</h2>

              <div className="flex gap-3">
                {/* bulk mode */}
                <select
                  onChange={(e) => applyBulkSeatMode(e.target.value)}
                  defaultValue=""
                  className="appearance-none bg-slate-800 border border-slate-600 px-3 py-2 text-xs rounded"
                >
                  <option value="" disabled>
                    Mode
                  </option>
                  <option value="FREE">Free Mode</option>
                  <option value="REQUEST">Request Mode</option>
                </select>

                {/* capacity */}
                <select
                  onChange={(e) => updateSeatCount(Number(e.target.value))}
                  defaultValue=""
                  className="appearance-none bg-slate-800 border border-slate-600 px-3 py-2 text-xs rounded"
                >
                  <option value="" disabled>
                    Capacity
                  </option>
                  <option value="8">8</option>
                  <option value="12">12</option>
                  <option value="16">16</option>
                  <option value="20">20</option>
                </select>
              </div>
            </div>

            <SeatGrid
              seats={room.seats}
              hostId={room.host.id}
              onRequestSeat={handleSeatClick}
              hostRemoveSeatUser={removeUserFromSeat}
              participants={participants}
              speakers={speakers}
              onClickSeatAsHost={(i) => {
                setSelectedSeatIndex(i);
                setModeModalOpen(true);
              }}
            />
          </div>
          {socket && (
            <ChatBox
              socket={socket}
              roomId={roomId}
              canControl={isHost}
              currentUserId={userId}
              chatMode={chatMode}
            />
          )}

          {/* logs */}
          <div className="card p-3">
            <h3 className="mb-1">Logs</h3>
            <pre className="bg-black p-2 text-xs h-40 overflow-auto">
              {log.join("\n")}
            </pre>
          </div>
        </div>

        {/* RIGHT: users + host panel */}
        <div className="space-y-4">
          <UserList participants={participants} />

          {isHost && (
            <HostModerationPanel
              socket={socket}
              roomId={roomId}
              participants={participants}
              refreshRoom={refreshRoomData}
              //  onMute={handleHostMute}
              onKick={handleKick}
            />
          )}
        </div>
      </main>

      {/* Modals */}
      <SeatModeModal
        open={modeModalOpen}
        seatIndex={selectedSeatIndex}
        onClose={() => setModeModalOpen(false)}
        onChangeMode={applySeatMode}
        onMuteSeat={(i, mute) => {
          mute ? muteSeatApi(roomId, i) : unmuteSeatApi(roomId, i);
        }}
        OnBulkSeatMode={applyBulkSeatMode}
        participants={participants}
        socket={socketRef.current}
        userId={hostRemoveSeatUser}
        roomId={roomId}
      />

      <SeatApprovalModal
        open={seatApprovalOpen}
        requests={seatRequests}
        onApprove={approveSeat}
        onDeny={denySeat}
        onClose={() => setSeatApprovalOpen(false)}
      />

      <SeatInviteModal
        invite={invite}
        onAccept={acceptInvite}
        onReject={rejectInvite}
      />
      {showPinModal && (
        <RoomPinModal
          open={showPinModal}
          error={pinError}
          //  loading={pendingJoin}
          onClose={() => {
            setShowPinModal(false);
            router.push("/rooms"); // leave room if cancelled
          }}
          onSubmit={async (pin: string) => {
            const joined = await attemptJoinRoom(pin);
            if (joined) {
              setShowPinModal(false);
            }
          }}
        />
      )}
    </div>
  );
}
