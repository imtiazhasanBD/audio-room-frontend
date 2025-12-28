"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  API_BASE,
  getKickListApi,
  Participant,
  unkickApi,
} from "@/app/lib/api";

export default function HostModerationPanel({
  socket,
  roomId,
  participants,
  refreshRoom,
  onKick,
}: {
  socket: any;
  roomId: string;
  participants: Participant[];
  refreshRoom: () => void;
  onKick: (userId: string) => void;
}) {
  // ===========================
  // HELPERS
  // ===========================
  const getImageSrc = (src?: string | null) => {
    if (!src) return null;
    if (src.startsWith("http://") || src.startsWith("https://")) {
      return src;
    }
    return `https://meetalklive.com${src}`;
  };

  const getGenderColor = (gender: string = "male") => {
    return gender === "female" ? "bg-pink-600" : "bg-blue-600";
  };

  // ===========================
  // SECTION 1 — Kicked Users
  // ===========================
  const [kicks, setKicks] = useState<any[]>([]);
  const [loadingKicks, setLoadingKicks] = useState(false);

  const loadKicks = async () => {
    setLoadingKicks(true);
    try {
      const list = await getKickListApi(roomId);
      setKicks(list);
    } catch (e) {
      console.error("Load kicks error:", e);
    }
    setLoadingKicks(false);
  };

  useEffect(() => {
    loadKicks();
  }, [roomId]);

  useEffect(() => {
    if (!socket) return;
    socket.on("kick.list.update", loadKicks);
    return () => socket.off("kick.list.update", loadKicks);
  }, [socket]);

  const handleUnkick = async (userId: string) => {
    if (!confirm("Allow this user to rejoin now?")) return;

    try {
      await unkickApi(roomId, userId);
      setKicks((prev) => prev.filter((k) => k.userId !== userId));
    } catch (e) {
      console.error("Unkick error:", e);
    }
  };

  // ===========================
  // UI PANELS
  // ===========================
  return (
    <div className="space-y-6 p-3 bg-slate-900 rounded-lg border border-slate-700">
      
      {/* ================================== */}
      {/* 🔵 ACTIVE PARTICIPANTS PANEL */}
      {/* ================================== */}
      <div>
        <h3 className="text-sm font-semibold mb-2 text-slate-200">Host Panel</h3>
        <div className="space-y-2 text-xs max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 pr-1">
          {participants?.map((p) => {
            const user = p.user;
            const displayName = user?.nickName || p.userId.slice(0, 8);
            const gender = user?.gender || "male";
            const profilePicSrc = getImageSrc(user?.profilePicture);

            return (
              <div
                key={p.id}
                className="flex justify-between items-center bg-slate-900/80 border border-slate-800 rounded-lg p-2 transition-colors hover:border-slate-700"
              >
                {/* User Info */}
                <div className="flex items-center gap-3">
                  <div className="relative w-8 h-8 rounded-full overflow-hidden border border-slate-600 shrink-0">
                    {profilePicSrc ? (
                      <Image
                        src={profilePicSrc}
                        alt={displayName}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center font-bold text-white text-xs ${getGenderColor(gender)}`}>
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="font-medium text-slate-100 flex items-center gap-1.5">
                      {displayName} 
                      {p.isHost && <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20 font-bold uppercase">HOST</span>}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                      {p.muted ? <span className="text-red-400">Muted</span> : <span className="text-emerald-400">Active</span>}
                      <span>·</span>
                      <span>ID: {p.userId.slice(0, 6)}</span>
                    </div>
                  </div>
                </div>

                {/* Controls */}
                {!p.isHost && (
                  <div className="flex gap-1.5">
                    {/* Placeholder Mute Button (disabled/commented logic) */}
                    <button
                      className="px-2 py-1 rounded text-[10px] font-medium bg-slate-700 text-slate-300 border border-slate-600 opacity-50 cursor-not-allowed"
                      disabled
                    >
                      Mute
                    </button>

                    <button
                      onClick={() => onKick(p.userId)}
                      className="px-2 py-1 rounded text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all"
                    >
                      Kick
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-slate-700/50 my-2"></div>

      {/* ================================== */}
      {/* 🔴 KICK LIST PANEL */}
      {/* ================================== */}
      <div>
        <h3 className="text-sm font-semibold mb-2 text-slate-200">Kicked Users</h3>

        {loadingKicks && (
          <div className="text-xs text-slate-500 italic">Loading kicked users...</div>
        )}

        {!loadingKicks && kicks.length === 0 && (
          <div className="text-xs text-slate-500 bg-slate-800/30 p-3 rounded-lg border border-slate-800/50 text-center">
            No kicked users found.
          </div>
        )}

        <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 pr-1">
          {kicks.map((k) => {
            const user = k.user;
            const displayName = user?.nickName || user?.name || k.userId.slice(0, 8);
            const gender = user?.gender || "male";
            const profilePicSrc = getImageSrc(user?.profilePicture);

            return (
              <div
                key={k.id}
                className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-slate-700/50"
              >
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="relative w-8 h-8 rounded-full overflow-hidden border border-slate-600 shrink-0">
                    {profilePicSrc ? (
                      <Image
                        src={profilePicSrc}
                        alt={displayName}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center font-bold text-white text-xs ${getGenderColor(gender)}`}>
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="font-medium text-slate-200 text-xs">{displayName}</div>
                    <div className="text-[10px] text-slate-400">
                      Expires: {new Date(k.expiresAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleUnkick(k.userId)}
                  className="px-2 py-1 bg-blue-600 text-white rounded text-[10px] font-medium hover:bg-blue-500 transition-colors"
                >
                  Unkick
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}