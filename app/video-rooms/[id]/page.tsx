"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AgoraRTC, {
  IAgoraRTCClient,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  IRemoteVideoTrack,
} from "agora-rtc-sdk-ng";
import {
  approveCohostApi,
  chatMode,
  endLiveVideoRoomApi,
  goLiveVideoRoomApi,
  joinVideoRoomApi,
  leaveVideoRoomApi,
  requestCohostApi,
  respondPkInviteApi,
} from "@/app/lib/api";
import { useVideoSocket } from "@/app/lib/useSocket";
import { getCurrentUser } from "@/app/lib/auth";
import CoHostGrid from "@/app/components/CoHostGrid";
import ChatBox from "@/app/components/ChatBox";

export default function VideoRoomJoinPage() {
  const { id: roomId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const user = getCurrentUser();

  // --- Refs ---
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const joiningRef = useRef(false);

  // Store local tracks in a ref to manage them easily
  const localTracksRef = useRef<{
    video?: ICameraVideoTrack;
    audio?: IMicrophoneAudioTrack;
  }>({});

  const [pkOpponentUid, setPkOpponentUid] = useState<number | null>(null);

  // --- State ---
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<any[]>([]);
  const [coHosts, setCoHosts] = useState<any[]>([]);
  const [rtcUid, setRtcUid] = useState<any>(null);
  const [hostRtcUid, setHostRtcUid] = useState<any>(null);
  console.log("room", room);
  const isHost = room?.hostId === user?.id;
  console.log("isHost", isHost);
  console.log(room?.hostId, user?.id);
  const [pendingRequest, setPendingRequest] = useState<any | null>(null);
  const [approving, setApproving] = useState(false);
  const [forcedMuted, setForcedMuted] = useState(false);
  const [forcedVideoOff, setForcedVideoOff] = useState(false);
  const [activeSpeakers, setActiveSpeakers] = useState<(string | number)[]>([]);
  const [chatMode, setChatMode] = useState<chatMode | null>(
    room?.chatMode ?? null,
  );
  const [hostAgoraUid, setHostAgoraUid] = useState<number | null>(null);

  // 1. NEW: Store all remote video tracks here (Key = Agora UID)
  const [remoteTracks, setRemoteTracks] = useState<
    Record<number, IRemoteVideoTrack>
  >({});

  // 2. NEW: State to trigger re-render for local video (since Ref changes don't trigger render)
  const [localVideoTrack, setLocalVideoTrack] = useState<
    ICameraVideoTrack | undefined
  >(undefined);

  /* ===================== PK STATE ===================== */
  // --- PK State ---
  const [pkBattle, setPkBattle] = useState<any | null>(null);
  const [pkScore, setPkScore] = useState({ scoreA: 0, scoreB: 0 });
  const [pkTimer, setPkTimer] = useState(0);
  const isPkHost = pkBattle && Number(pkBattle.myRtcUid) === Number(rtcUid);

  /* ---------------- SOCKET LOGIC ---------------- */
  const socket = useVideoSocket(roomId, user?.id);

  useEffect(() => {
    if (!socket || !roomId) return;

    socket.on("VIDEO_PARTICIPANTS_UPDATED", (data: any[]) => {
      console.log("Participants updated:", data);
      setParticipants(data);
    });

    socket.on("VIDEO_COHOSTS_UPDATED", (data: any[]) => {
      console.log("CoHosts updated:", data);
      setCoHosts(data);
    });

    socket.on("VIDEO_ROOM_UPDATED", (data: any[]) => {
      console.log("room updated:", data);
      setRoom(data);
    });

    // Co-host approved (private)
    socket.on("VIDEO_PUBLISHER_ADDED", async (rtc) => {
      if (!clientRef.current) return;

      await clientRef.current.setClientRole("host");

      const [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks();
      localTracksRef.current.audio = mic;
      localTracksRef.current.video = cam;
      setLocalVideoTrack(cam);

      await clientRef.current.publish([mic, cam]);
    });

    // Forced remove / leave
    socket.on("VIDEO_REMOVED_COHOST", async ({ userId }) => {
      if (userId === user?.id) {
        await clientRef.current?.unpublish();
        localTracksRef.current.video?.close();
        localTracksRef.current.audio?.close();
        setLocalVideoTrack(undefined);
        await clientRef.current?.setClientRole("audience");
      }
    });

    // Host mute me
    socket.on("VIDEO_ACTION_MUTE", () => {
      localTracksRef.current.audio?.setEnabled(false);
      setForcedMuted(true);
    });

    socket.on("VIDEO_ACTION_UNMUTE", () => {
      setForcedMuted(false);
    });

    socket.on("VIDEO_ACTION_VIDEO_OFF", () => {
      localTracksRef.current.video?.setEnabled(false);
      setForcedVideoOff(true);
    });

    socket.on("VIDEO_ACTION_VIDEO_ON", () => {
      console.log("VIDEO_ACTION_VIDEO_ON");
      setForcedVideoOff(false);
    });

    socket.on("VIDEO_TOGGLE_ACTION", ({ userId, action }) => {
      console.log("VIDEO_TOGGLE_ACTION", userId, action);
      if (userId !== user?.id) return;

      if (action === "MUTE") {
        localTracksRef.current.audio?.setEnabled(false);
        setForcedMuted(true);
      }

      if (action === "UNMUTE") {
        localTracksRef.current.audio?.setEnabled(true);
        setForcedMuted(false);
      }

      if (action === "VIDEO_OFF") {
        localTracksRef.current.video?.setEnabled(false);
        setForcedVideoOff(true);
      }

      if (action === "VIDEO_ON") {
        localTracksRef.current.video?.setEnabled(true);
        setForcedVideoOff(false);
      }
    });

    socket.on("VIDEO_ROOM_ENDED", (data: any[]) => {
      console.log("VIDEO_ROOM_ENDED:", data);
    });

    socket.on("VIDEO_PUBLISHER_LEAVE", (data: any[]) => {
      console.log("VIDEO_PUBLISHER_LEAVE:", data);
    });

    // Handle when *I* am promoted to Co-Host

    socket.on("VIDEO_ROOM_ENDED", () => {
      alert("Live ended");
      leaveRoom();
      router.push("/video-rooms");
    });

    /* ---------- PK ---------- */

    socket.on("PK_INVITE", (data) => {
      // data contains: pkId, fromRoomId, fromHost (full user object from your backend)
      setPendingRequest({
        ...data,
        isPk: true,
        user: data.fromHost, // Map the host data so the UI can show their avatar/name
      });

      // Optional: Play a "challenge" sound effect
      const audio = new Audio("/sounds/challenge.mp3");
      audio.play();
    });

    socket.on("PK_STARTED", async (data) => {
      setPkBattle(data);
        setPkOpponentUid(Number(data.opponentRtcUid));
      if (!clientRef.current) return;

      const client = clientRef.current;

      const config = AgoraRTC.createChannelMediaRelayConfiguration();

      config.setSrcChannelInfo({
        channelName: `room_${data.myRoomId}`,
        uid: Number(data.myRtcUid),
        token: "",
      });

      config.addDestChannelInfo({
        channelName: `room_${data.opponentRoomId}`,
        uid: 0,
        token: data.relayToken,
      });

      await client.startChannelMediaRelay(config);
    });

    socket.on("VIDEO_FORCE_UNPUBLISH", async () => {
      if (!clientRef.current) return;

      await clientRef.current.unpublish();

      localTracksRef.current.video?.setEnabled(false);
      localTracksRef.current.audio?.setEnabled(false); // 🔥 add
    });

    socket.on("PK_SCORE", (data) => {
      setPkScore({ scoreA: data.scoreA, scoreB: data.scoreB });
    });

    socket.on("PK_ENDED", async () => {
      await clientRef.current?.stopChannelMediaRelay();

      if (isHost) {
        const [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks();
        localTracksRef.current.audio = mic;
        localTracksRef.current.video = cam;
        setLocalVideoTrack(cam);
        await clientRef.current?.publish([mic, cam]);
      }

      setPkBattle(null);
      setPkScore({ scoreA: 0, scoreB: 0 });
    });

    return () => {
      socket.emit("room.leave", { roomId });
      socket.off("VIDEO_PARTICIPANTS_UPDATED");
      socket.off("VIDEO_COHOSTS_UPDATED");
      socket.off("VIDEO_PUBLISHER_ADDED");
      socket.off("VIDEO_LEAVE");
      socket.off("PK_INVITE");
      socket.off("PK_STARTED");
      socket.off("PK_SCORE");
      socket.off("PK_ENDED");
    };
  }, [socket, roomId]);

  /* ---------------- HOST REQUEST LISTENER ---------------- */
  useEffect(() => {
    if (!socket || !isHost) return;

    const handler = ({ request }: any) => {
      setPendingRequest(request);
    };

    socket.on("VIDEO_COHOST_REQUESTED", handler);
    return () => {
      socket.off("VIDEO_COHOST_REQUESTED", handler);
    };
  }, [socket, isHost]);

  /* ---------------- AGORA JOIN LOGIC ---------------- */
  useEffect(() => {
    if (!roomId) return;
    joinRoom();

    return () => {
      leaveRoom();
    };
  }, [roomId]);

  async function joinRoom() {
    if (joiningRef.current || clientRef.current) return;
    joiningRef.current = true;

    try {
      // 1. API Call to get Room Details & Token
      const res = await joinVideoRoomApi(roomId);

      const isRoomHost = res.room.hostId === user?.id;

      setRoom(res.room);
      setHostRtcUid(res.room.hostRtcUid);
      setRtcUid(res.token.uid);
      setCoHosts(res.room.coHosts || []);

      const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
      await client.enableDualStream();
      clientRef.current = client;

      await client.setClientRole(isRoomHost ? "host" : "audience");

      // 3. Setup Remote Track Listeners (Host or CoHosts)
      client.on("user-published", async (remoteUser, mediaType) => {
        await client.subscribe(remoteUser, mediaType);

        if (mediaType === "video") {
          setRemoteTracks((prev) => ({
            ...prev,
            [Number(remoteUser.uid)]: remoteUser.videoTrack!,
          }));

          // 🔥 FIRST PUBLISHER IS THE HOST
          if (!hostAgoraUid) {
            setHostAgoraUid(Number(remoteUser.uid));
          }
        }

        if (mediaType === "audio") {
          remoteUser.audioTrack?.play();
        }
      });

      client.on("user-unpublished", (remoteUser, mediaType) => {
        if (mediaType === "video") {
          // Remove from State
          setRemoteTracks((prev) => {
            const newTracks = { ...prev };
            delete newTracks[Number(remoteUser.uid)];
            return newTracks;
          });
        }
      });

      // 4. Join Channel
      await client.join(
        process.env.NEXT_PUBLIC_AGORA_APP_ID!,
        `room_${roomId}`,
        res.token.token,
        res.token.uid,
      );

      if (isRoomHost) {
        const [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks();
        localTracksRef.current.audio = mic;
        localTracksRef.current.video = cam;
        setLocalVideoTrack(cam);
        await client.publish([mic, cam]);
      }

      client.enableAudioVolumeIndicator();
      client.on("volume-indicator", (volumes) => {
        const speaking = volumes
          .filter((v) => v.level > 5) // adjust sensitivity
          .map((v) => v.uid);

        setActiveSpeakers(speaking);
      });

      setLoading(false);
    } catch (e) {
      console.error("Join Error:", e);
      alert("Failed to join stream");
      router.push("/video-rooms");
    }
  }

  async function leaveRoom() {
    try {
      localTracksRef.current.video?.close();
      localTracksRef.current.audio?.close();
      setLocalVideoTrack(undefined);
      await clientRef.current?.leave();
    } finally {
      clientRef.current = null;
      joiningRef.current = false;
    }
  }
  useEffect(() => {
    if (!pkBattle) return;
    setPkTimer(pkBattle.duration);

    const i = setInterval(() => {
      setPkTimer((t) => {
        if (t <= 1) {
          clearInterval(i);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(i);
  }, [pkBattle]);

  /* ---------------- RENDER HELPERS ---------------- */

  const approveRequest = async () => {
    if (!pendingRequest) return;
    try {
      setApproving(true);
      await approveCohostApi(roomId, pendingRequest.id);
      setPendingRequest(null);
    } catch (err) {
      console.error(err);
      alert("Failed to approve co-host");
    } finally {
      setApproving(false);
    }
  };

  const rejectRequest = () => {
    setPendingRequest(null);
  };

  const handleEndLive = async () => {
    if (!confirm("End live for everyone?")) return;

    try {
      await endLiveVideoRoomApi();
      await leaveRoom();
      router.push("/video-rooms");
    } catch {
      alert("Failed to end live");
    }
  };

  const handleLeaveRoom = async () => {
    try {
      await leaveVideoRoomApi(roomId);
      await leaveRoom();
      router.push("/video-rooms");
    } catch {
      alert("Failed to leave room");
    }
  };

  const handleRequestCohost = async () => {
    try {
      await requestCohostApi(roomId);
    } catch {
      alert("Failed to request co-host");
    }
  };

  const unmuteSelf = async () => {
    // localTracksRef.current.audio?.setEnabled(true);
    socket?.emit("VIDEO_USER_TOGGLE", { roomId, action: "UNMUTE" });
  };

  const enableVideoSelf = async () => {
    // localTracksRef.current.video?.setEnabled(true);
    //   setForcedVideoOff(false);
    socket?.emit("VIDEO_USER_TOGGLE", { roomId, action: "VIDEO_ON" });
  };
  const approvePkRequest = async () => {
    if (!pendingRequest) return;
    try {
      setApproving(true);

      // Check if this is a PK Invite based on the presence of pkId
      if (pendingRequest.pkId) {
        await respondPkInviteApi(pendingRequest.pkId, "ACCEPT");
      } else {
        await approveCohostApi(roomId, pendingRequest.id);
      }

      setPendingRequest(null);
    } catch (err) {
      console.error("Approval failed:", err);
      alert("Action failed");
    } finally {
      setApproving(false);
    }
  };
  // Determine which track belongs to the Main Host
  // Logic: If I am host, use local. If I am viewer, use remote track matching room.hostRtcUid
  const hostVideoTrack = isHost
    ? localVideoTrack
    : hostAgoraUid
      ? remoteTracks[hostAgoraUid]
      : undefined;

  console.log(hostVideoTrack);
  if (loading || !room) {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-white">
        <div className="animate-pulse">Connecting to live stream...</div>
      </div>
    );
  }
  const myPkTrack = pkBattle ? localVideoTrack : undefined;

const opponentPkTrack =
  pkBattle && pkOpponentUid
    ? remoteTracks[pkOpponentUid]
    : undefined;

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">LIVE: {room.title}</h1>

        {isHost ? (
          <button
            onClick={handleEndLive}
            className="px-4 py-2 rounded-full text-sm font-semibold
                 bg-red-600 hover:bg-red-500 transition shadow-lg"
          >
            End Live
          </button>
        ) : (
          <button
            onClick={handleLeaveRoom}
            className="px-4 py-2 rounded-full text-sm font-semibold
                 bg-gray-800 hover:bg-gray-700 transition shadow-lg"
          >
            Leave Room
          </button>
        )}
      </div>

      {/* --- 1. MAIN STAGE (HOST ONLY) --- */}
      {/* --- PK BATTLE STAGE --- */}

      <div className="flex flex-col w-full max-w-5xl mx-auto px-2">
        {pkBattle ? (
          <div className="relative group">
            {/* 1. FLOATING NEON TIMER */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
              <div className="bg-blue-950/40 backdrop-blur-xl px-5 py-2 rounded-2xl border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.2)] flex items-center gap-3">
                <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_8px_#22d3ee]" />
                <span className="text-sm font-black text-cyan-100 tabular-nums tracking-[0.15em]">
                  {Math.floor(pkTimer / 60)}:
                  {(pkTimer % 60).toString().padStart(2, "0")}
                </span>
              </div>
            </div>

            {/* 2. THE CYBER SCORE BAR */}
            <div className="relative w-full h-14 bg-slate-950 rounded-t-[2rem] border-t border-x border-blue-500/20 overflow-hidden flex items-center">
              {/* Team A Progress (Electric Blue) */}
              <div
                className="h-full bg-gradient-to-r from-blue-700 via-blue-500 to-cyan-400 transition-all duration-1000 ease-out relative"
                style={{
                  width: `${(pkScore.scoreA / (pkScore.scoreA + pkScore.scoreB || 1)) * 100}%`,
                }}
              >
                {/* Scanline Animation Effect */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,transparent_0%,rgba(255,255,255,0.3)_50%,transparent_100%)] w-20 -translate-x-full animate-[shimmer_2s_infinite]" />
              </div>

              {/* Team B Progress (Deep Indigo Contrast) */}
              <div className="flex-1 h-full bg-indigo-950 transition-all duration-700 ease-out" />

              {/* Score Text Overlays */}
              <div className="absolute inset-0 flex justify-between items-center px-8 pointer-events-none">
                <div className="flex flex-col">
                  <span className="text-white font-black text-2xl tracking-tighter drop-shadow-[0_0_10px_rgba(59,130,246,0.8)]">
                    {pkScore.scoreA.toLocaleString()}
                  </span>
                  <span className="text-[9px] text-blue-300 font-bold uppercase tracking-[0.3em] opacity-70">
                    Blue Unit
                  </span>
                </div>

                <div className="relative">
                  <div className="bg-blue-600 text-white font-black italic text-xs px-5 py-1 rounded-sm skew-x-[-12deg] shadow-[4px_4px_0px_#000] border border-cyan-300">
                    VS
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <span className="text-white font-black text-2xl tracking-tighter drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]">
                    {pkScore.scoreB.toLocaleString()}
                  </span>
                  <span className="text-[9px] text-indigo-300 font-bold uppercase tracking-[0.3em] opacity-70">
                    Indigo Unit
                  </span>
                </div>
              </div>
            </div>

            {/* 3. VIDEO GRID WITH "ACTIVE" OVERLAYS */}
            <div className="grid grid-cols-2 aspect-video bg-slate-950 rounded-b-[2rem] overflow-hidden border-b border-x border-blue-500/20 shadow-2xl relative">
              {/* Player Left (Me) */}
              <div
                className={`relative transition-all duration-500 ${pkScore.scoreA >= pkScore.scoreB ? "after:absolute after:inset-0 after:bg-blue-500/10 after:border-4 after:border-blue-400 after:pointer-events-none" : "opacity-80"}`}
              >
                <AgoraPlayer videoTrack={myPkTrack} />

                <div className="absolute bottom-5 left-5 flex items-center gap-3">
                  <div className="bg-blue-600 text-white text-[10px] font-black px-3 py-1.5 rounded border-l-4 border-cyan-300 uppercase tracking-widest shadow-lg">
                    YOU
                  </div>
                </div>
              </div>

              {/* Player Right (Opponent) */}
              <div
                className={`relative bg-slate-900 transition-all duration-500 ${pkScore.scoreB > pkScore.scoreA ? "after:absolute after:inset-0 after:bg-indigo-500/10 after:border-4 after:border-indigo-400 after:pointer-events-none" : "opacity-80"}`}
              >
                <AgoraPlayer videoTrack={opponentPkTrack} />

                <div className="absolute bottom-5 right-5 flex items-center gap-3 flex-row-reverse">
                  <div className="bg-slate-800 text-slate-300 text-[10px] font-black px-3 py-1.5 rounded border-r-4 border-indigo-500 uppercase tracking-widest">
                    OPPONENT
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Standard View with a Neon Blue Frame */
          <div className="relative group p-[1px] rounded-[2.5rem] bg-gradient-to-b from-blue-500/40 to-transparent shadow-2xl">
            <div className="w-full aspect-video bg-slate-950 rounded-[2.4rem] overflow-hidden relative">
              <AgoraPlayer
                videoTrack={hostVideoTrack}
                cover={room.coverImage}
              />
              <div className="absolute top-6 left-6 flex items-center bg-blue-600/20 backdrop-blur-md px-4 py-1.5 rounded-lg border border-blue-400/30">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-ping mr-2.5" />
                <span className="text-[11px] font-black text-blue-50 uppercase tracking-widest">
                  Live Stream
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- 2. CO-HOST GRID --- */}
      <div className="max-w-6xl mx-auto mt-8">
        <h3 className="text-xs text-slate-400 mb-3 uppercase tracking-widest font-bold">
          Co-Host Stage
        </h3>

        {/* Pass the tracks to the Grid. 
            The Grid will match `cohost.rtcUid` to `remoteTracks` keys.
        */}
        <CoHostGrid
          coHosts={coHosts}
          isHost={isHost}
          currentUserId={user?.id}
          roomId={roomId}
          socket={socket}
          remoteTracks={remoteTracks}
          localVideoTrack={!isHost ? localVideoTrack : undefined}
          videoOff={forcedVideoOff}
          muted={forcedMuted}
        />
      </div>

      {/* --- 3. CONTROLS --- */}
      {!isHost && (
        <div className="flex justify-center mt-8">
          <button
            onClick={handleRequestCohost}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3 rounded-full transition-all shadow-lg hover:shadow-blue-500/25"
          >
            Request to Join Stage
          </button>
        </div>
      )}
      <div className="flex gap-6 max-w-6xl mx-auto mt-12 border-t border-gray-800 pt-6 h-[500px]">
        {/* CHAT */}
        <div className="flex-1 min-w-0">
          {socket && (
            <ChatBox
              socket={socket}
              roomId={roomId}
              canControl={isHost}
              currentUserId={user?.id}
              chatMode={chatMode}
            />
          )}
        </div>

        {/* PARTICIPANTS */}
        <div className="w-56 flex-shrink-0">
          <h3 className="font-bold mb-4 text-lg">
            Participants ({participants.length})
          </h3>

          <div className="flex flex-col gap-3 max-h-full overflow-y-auto pr-2">
            {participants.map((p) => (
              <div
                key={p.id}
                className="flex justify-between items-center text-sm p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300">
                    {p.user?.nickName?.[0] || "?"}
                  </div>
                  <span className="font-medium text-gray-300">
                    {p.user?.nickName || "User"}
                  </span>
                </div>

                <span
                  className={`text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider ${
                    p.role === "HOST"
                      ? "bg-pink-500/10 text-pink-400 border border-pink-500/20"
                      : p.isPublisher
                        ? "bg-green-500/10 text-green-400 border border-green-500/20"
                        : "bg-gray-800 text-gray-500 border border-gray-700"
                  }`}
                >
                  {p.role === "HOST"
                    ? "HOST"
                    : p.isPublisher
                      ? "CO-HOST"
                      : "VIEWER"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {pendingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur">
          <div className="bg-gray-900 text-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-bold mb-2">Co-Host Request</h3>
            <p className="text-sm text-gray-300 mb-4">
              <span className="font-semibold">
                {pendingRequest.user?.nickName || "Someone"}
              </span>{" "}
              wants to join your stage.
            </p>

            <div className="flex gap-3">
              <button
                onClick={rejectRequest}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600"
              >
                Reject
              </button>
              <button
                onClick={approveRequest}
                disabled={approving}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
              >
                {approving ? "Approving..." : "Approve"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isHost && (forcedMuted || forcedVideoOff) && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
                  bg-gray-900/90 backdrop-blur px-4 py-3 rounded-full
                  shadow-xl flex gap-4 items-center"
        >
          {forcedMuted && (
            <button
              onClick={unmuteSelf}
              className="text-yellow-400 hover:text-yellow-300 font-semibold text-sm"
            >
              🎤 Unmute
            </button>
          )}

          {forcedVideoOff && (
            <button
              onClick={enableVideoSelf}
              className="text-blue-400 hover:text-blue-300 font-semibold text-sm"
            >
              📷 Turn Camera On
            </button>
          )}
        </div>
      )}

      {pendingRequest?.isPk && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative bg-gradient-to-b from-gray-900 to-black border border-yellow-500/50 rounded-3xl p-8 w-full max-w-sm shadow-[0_0_50px_rgba(234,179,8,0.2)] text-center">
            {/* Animated VS Header */}
            <div className="flex justify-center items-center gap-4 mb-6">
              <div className="relative">
                <img
                  src={user?.username}
                  className="w-16 h-16 rounded-full border-2 border-blue-500"
                  alt="You"
                />
              </div>
              <div className="text-2xl font-black italic text-yellow-500 animate-pulse">
                VS
              </div>
              <div className="relative">
                <img
                  src={pendingRequest.user?.profilePicture}
                  className="w-16 h-16 rounded-full border-2 border-red-500"
                  alt="Challenger"
                />
              </div>
            </div>

            <h2 className="text-xl font-bold text-white mb-1">PK CHALLENGE!</h2>
            <p className="text-gray-400 text-sm mb-6">
              <span className="text-white font-semibold">
                {pendingRequest.user?.nickName}
              </span>{" "}
              has challenged you to a battle.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={approvePkRequest}
                disabled={approving}
                className="w-full py-4 bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-400 hover:to-orange-500 text-black font-black rounded-xl transition-all transform active:scale-95 shadow-lg"
              >
                {approving ? "PREPARING BATTLE..." : "ACCEPT CHALLENGE"}
              </button>

              <button
                onClick={() => setPendingRequest(null)}
                className="w-full py-3 bg-white/5 hover:bg-white/10 text-gray-400 font-semibold rounded-xl transition-colors"
              >
                Decline
              </button>
            </div>

            {/* Auto-decline timer bar */}
            <div className="absolute bottom-0 left-0 h-1 bg-yellow-500/30 w-full overflow-hidden rounded-b-3xl">
              <div
                className="h-full bg-yellow-500 animate-shrink-width"
                style={{ animationDuration: "15s" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================
   HELPER COMPONENT: AGORA PLAYER
   (Keeps the video playing smoothly)
   ========================================= */

interface AgoraPlayerProps {
  videoTrack: IRemoteVideoTrack | ICameraVideoTrack | undefined;
  cover?: string | null;
}

const AgoraPlayer = ({ videoTrack, cover }: AgoraPlayerProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && videoTrack) {
      videoTrack.play(ref.current);
    }
    return () => {
      // Don't close/stop the track here, just let it unmount from DOM
      // The parent handles closing tracks on leave
    };
  }, [videoTrack]);

  return (
    <div className="w-full h-full relative group">
      <div ref={ref} className="w-full h-full object-cover" />

      {/* Cover Image Fallback */}
      {!videoTrack && cover && (
        <img
          src={cover}
          alt="Cover"
          className="absolute inset-0 w-full h-full object-cover z-0 opacity-50"
        />
      )}
    </div>
  );
};