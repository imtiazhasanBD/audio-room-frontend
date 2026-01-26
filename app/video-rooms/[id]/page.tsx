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
  endLiveVideoRoomApi,
  goLiveVideoRoomApi,
  joinVideoRoomApi,
  leaveVideoRoomApi,
  requestCohostApi,
} from "@/app/lib/api";
import { useVideoSocket } from "@/app/lib/useSocket";
import { getCurrentUser } from "@/app/lib/auth";
import CoHostGrid from "@/app/components/CoHostGrid";

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

  // --- State ---
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<any[]>([]);
  const [coHosts, setCoHosts] = useState<any[]>([]);
  const [rtcUid, setRtcUid] = useState<any>(null);
  console.log("room", room);
  const isHost = room?.hostId === user?.id;
  console.log("isHost", isHost);
  console.log(room?.hostId, user?.id);
  const [pendingRequest, setPendingRequest] = useState<any | null>(null);
  const [approving, setApproving] = useState(false);
  const [forcedMuted, setForcedMuted] = useState(false);
  const [forcedVideoOff, setForcedVideoOff] = useState(false);
  const [activeSpeakers, setActiveSpeakers] = useState<(string | number)[]>([]);

  // 1. NEW: Store all remote video tracks here (Key = Agora UID)
  const [remoteTracks, setRemoteTracks] = useState<
    Record<string, IRemoteVideoTrack>
  >({});

  // 2. NEW: State to trigger re-render for local video (since Ref changes don't trigger render)
  const [localVideoTrack, setLocalVideoTrack] = useState<
    ICameraVideoTrack | undefined
  >(undefined);

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

    return () => {
      socket.emit("room.leave", { roomId });
      socket.off("VIDEO_PARTICIPANTS_UPDATED");
      socket.off("VIDEO_COHOSTS_UPDATED");
      socket.off("VIDEO_PUBLISHER_ADDED");
      socket.off("VIDEO_LEAVE");
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
      const res = await (isHost
        ? goLiveVideoRoomApi()
        : joinVideoRoomApi(roomId));
      setRoom(res.room);
      setRtcUid(res.token.uid);
      setCoHosts(res.room.coHosts || []);

      // 2. Init Agora Client
      const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
      clientRef.current = client;

      await client.setClientRole(isHost ? "host" : "audience");

      // 3. Setup Remote Track Listeners (Host or CoHosts)
      client.on("user-published", async (remoteUser, mediaType) => {
        await client.subscribe(remoteUser, mediaType);

        if (mediaType === "video") {
          // Save remote video track to State
          setRemoteTracks((prev) => ({
            ...prev,
            [remoteUser.uid]: remoteUser.videoTrack as IRemoteVideoTrack,
          }));
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
            delete newTracks[remoteUser.uid];
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
      client.enableAudioVolumeIndicator();
      client.on("volume-indicator", (volumes) => {
        const speaking = volumes
          .filter((v) => v.level > 5) // adjust sensitivity
          .map((v) => v.uid);

        setActiveSpeakers(speaking);
      });

      setLoading(false);

      // 5. If I am the Room Owner (Host), Publish Immediately
      if (isHost) {
        const [mic, cam] = await AgoraRTC.createMicrophoneAndCameraTracks();
        localTracksRef.current.audio = mic;
        localTracksRef.current.video = cam;
        setLocalVideoTrack(cam); // Update state

        await client.publish([mic, cam]);
      }
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

  // Determine which track belongs to the Main Host
  // Logic: If I am host, use local. If I am viewer, use remote track matching room.hostRtcUid
  const hostVideoTrack = isHost
    ? localVideoTrack
    : rtcUid
      ? remoteTracks[rtcUid]
      : undefined;
  console.log(hostVideoTrack);
  if (loading || !room) {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-white">
        <div className="animate-pulse">Connecting to live stream...</div>
      </div>
    );
  }

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
      <div className="flex justify-center mb-6">
        <div className="w-full max-w-3xl aspect-video bg-gray-900 rounded-xl overflow-hidden border border-gray-800 relative shadow-2xl">
          <AgoraPlayer videoTrack={hostVideoTrack} cover={room.coverImage} />

          {/* Host Badge */}
          <div className="absolute top-4 left-4 bg-red-600 px-3 py-1 text-xs font-bold rounded-full text-white z-10 shadow-sm">
            HOST
          </div>

          {/* Fallback Text */}
          {!hostVideoTrack && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500 font-medium">
              Waiting for host video...
            </div>
          )}
        </div>
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

      {/* --- 4. PARTICIPANTS LIST --- */}
      <div className="max-w-6xl mx-auto mt-12 border-t border-gray-800 pt-6">
        <h3 className="font-bold mb-4 text-lg">
          Participants ({participants.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
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
