import React from 'react';
import { Mic, MicOff, X, User as UserIcon, Plus } from 'lucide-react';
import { IRemoteVideoTrack, ICameraVideoTrack } from "agora-rtc-sdk-ng";
import AgoraPlayer from './AgoraPlayer'; // Import the helper from Step 1

interface CoHostGridProps {
  coHosts: any[];
  isHost: boolean;
  roomId: string;
  currentUserId: string | undefined;
  socket: any;
  // New Props
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
  localVideoTrack
}) => {
  
  const TOTAL_SEATS = 3;
  const emptySlots = Math.max(0, TOTAL_SEATS - coHosts.length);

  const handleRemove = (userId: string) => {
    if (socket) socket.emit("VIDEO_COHOST_REMOVE", { roomId, targetUserId: userId });
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
        const videoTrack = isMe 
          ? localVideoTrack 
          : remoteTracks[cohost.rtcUid]; // Ensure cohost.rtcUid matches Agora UID

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
               <div className={`p-1 rounded-full backdrop-blur-md ${cohost.muted ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                 {cohost.muted ? <MicOff size={12} /> : <Mic size={12} />}
               </div>
            </div>

            {/* Name Overlay */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8 z-10">
              <p className="text-white text-xs font-semibold">{user.nickName}</p>
            </div>

            {/* Remove Button */}
            {isHost && !isMe && (
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
                <button
                  onClick={() => handleRemove(cohost.userId)}
                  className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Empty Slots Logic... (Keep your existing code) */}
      {[...Array(emptySlots)].map((_, i) => (
        <div key={`empty-${i}`} className="aspect-[3/4] md:aspect-video bg-gray-900/50 rounded-xl border-2 border-dashed border-gray-800 flex flex-col items-center justify-center gap-2">
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