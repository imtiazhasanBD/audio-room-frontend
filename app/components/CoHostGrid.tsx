import React from "react";
import { Mic, MicOff, X, User as UserIcon, Plus } from "lucide-react";
import { IRemoteVideoTrack, ICameraVideoTrack } from "agora-rtc-sdk-ng";
import AgoraPlayer from "./AgoraPlayer"; // Import the helper from Step 1
import { leaveCohostApi, removeCohostApi } from "../lib/api";

interface CoHostGridProps {
  coHosts: any[];
  isHost: boolean;
  roomId: string;
  currentUserId: string | undefined;
  socket: any;
  videoOff: boolean;
  muted: boolean;
  remoteTracks: Record<string, IRemoteVideoTrack>;
  localVideoTrack?: ICameraVideoTrack;
}

const CoHostGrid: React.FC<CoHostGridProps> = ({
  coHosts,
  isHost,
  roomId,
  socket,
  currentUserId,
  remoteTracks,
  localVideoTrack,
  videoOff,
  muted,
}) => {
  const TOTAL_SEATS = 3;
  const emptySlots = Math.max(0, TOTAL_SEATS - coHosts.length);

  const handleRemoveCohost = async (userId: string) => {
    try {
      await removeCohostApi(roomId, userId);
    } catch (e) {
      alert("Failed to remove co-host");
    }
  };

  const handleLeaveStage = async () => {
    try {
      await leaveCohostApi(roomId);

      socket.emit("VIDEO_COHOST_LEAVE", { roomId });
    } catch (e) {
      alert("Failed to leave stage");
    }
  };

  const handleMuteUser = (userId: string) => {
    socket.emit("VIDEO_MUTE_USER", {
      roomId,
      targetUserId: userId,
    });
  };

  const handleDisableVideo = (userId: string) => {
    socket.emit("VIDEO_DISABLE_VIDEO", {
      roomId,
      targetUserId: userId,
    });
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {coHosts.map((cohost) => {
        const user = cohost.user;
        if (!user) return null;

        const isMe = user.id === currentUserId;

        // LOGIC: Find the video track for this user
        // 1. If it's ME, use my local track.
        // 2. If it's someone else, look up their RTC UID in the remoteTracks object.
        const videoTrack = isMe ? localVideoTrack : remoteTracks[cohost.rtcUid]; // Ensure cohost.rtcUid matches Agora UID

        return (
          <div
            key={cohost.id}
            className="group relative aspect-[3/4] md:aspect-video bg-gray-900 rounded-xl overflow-hidden border border-gray-800 shadow-lg"
          >
            {/* --- VIDEO PLAYER HERE --- */}
            <div className="absolute inset-0 z-0">
              <AgoraPlayer
                videoTrack={videoTrack}
                cover={user.profilePicture} // Fallback if video is off
              />
            </div>

            {/* If no video track and no profile picture, show icon */}
            {!videoTrack && !user.profilePicture && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-gray-600 z-0">
                <UserIcon size={32} />
              </div>
            )}

            {/* Status Bar */}
            <div className="absolute top-2 left-2 right-2 flex justify-between z-10">
              <div className="flex gap-1">
                {/* Mic */}
                <div
                  className={`p-1 rounded-full backdrop-blur-md ${
                    muted
                      ? "bg-red-500/20 text-red-400"
                      : "bg-green-500/20 text-green-400"
                  }`}
                  title={muted ? "Muted" : "Mic On"}
                >
                  {muted ? <MicOff size={12} /> : <Mic size={12} />}
                </div>

                {/* Camera */}
                <div
                  className={`p-1 rounded-full backdrop-blur-md ${
                    videoOff
                      ? "bg-blue-500/20 text-blue-400"
                      : "bg-green-500/20 text-green-400"
                  }`}
                  title={videoOff ? "Camera Off" : "Camera On"}
                >
                  {videoOff ? <UserIcon size={12} /> : <UserIcon size={12} />}
                </div>
              </div>
            </div>

            {/* Name Overlay */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8 z-10">
              <p className="text-white text-xs font-semibold">
                {user.nickName}
              </p>
            </div>

            {/* Remove Button */}
            {isHost && !isMe && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm
                  opacity-0 group-hover:opacity-100 transition-all duration-200 z-20"
              >
                <div className="flex gap-3">
                  {/* Mute */}
                  <button
                    onClick={() => handleMuteUser(cohost.userId)}
                    className="w-10 h-10 rounded-full flex items-center justify-center
                   bg-gray-800/80 hover:bg-yellow-500/80 text-yellow-400 hover:text-white
                   shadow-lg active:scale-90 transition"
                    title="Mute Mic"
                  >
                    <MicOff size={16} />
                  </button>

                  {/* Disable Camera */}
                  <button
                    onClick={() => handleDisableVideo(cohost.userId)}
                    className="w-10 h-10 rounded-full flex items-center justify-center
                   bg-gray-800/80 hover:bg-blue-500/80 text-blue-400 hover:text-white
                   shadow-lg active:scale-90 transition"
                    title="Turn Off Camera"
                  >
                    <UserIcon size={16} />
                  </button>

                  {/* Remove */}
                  <button
                    onClick={() => handleRemoveCohost(cohost.userId)}
                    className="w-10 h-10 rounded-full flex items-center justify-center
                   bg-gray-800/80 hover:bg-red-500/80 text-red-400 hover:text-white
                   shadow-lg active:scale-90 transition"
                    title="Remove from stage"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Remove Button */}
            {isMe && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm 
                  opacity-0 group-hover:opacity-100 transition-all duration-200 z-20"
              >
                <button
                  onClick={handleLeaveStage}
                  className="flex items-center gap-2 px-4 py-2 rounded-full 
                 bg-gradient-to-r from-red-600 to-pink-600 
                 hover:from-red-500 hover:to-pink-500 
                 text-white text-sm font-semibold shadow-lg 
                 hover:shadow-red-500/30 active:scale-95 transition"
                >
                  <X size={16} />
                  <span>Leave Camera</span>
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Empty Slots Logic... (Keep your existing code) */}
      {[...Array(emptySlots)].map((_, i) => (
        <div
          key={`empty-${i}`}
          className="aspect-[3/4] md:aspect-video bg-gray-900/50 rounded-xl border-2 border-dashed border-gray-800 flex flex-col items-center justify-center gap-2"
        >
          <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-500">
            <Plus size={20} />
          </div>
          <span className="text-gray-500 text-xs font-medium">Empty Seat</span>
        </div>
      ))}
    </div>
  );
};

export default CoHostGrid;
