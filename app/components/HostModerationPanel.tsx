"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  API_BASE,
  approveSeatApi,
  getKickListApi,
  Participant,
  unkickApi,
} from "@/app/lib/api";

export default function HostModerationPanel({
  socket,
  roomId,
  participants,
  refreshRoom,
  onMute,
  onKick,
}: {
  socket: any;
  roomId: string;
  participants: Participant[];
  refreshRoom: () => void;
  onMute: (targetUserId: string, mute: boolean) => Promise<void>;
  onKick: (userId: string) => void;
}) {
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
      <h3 className="text-sm font-semibold mb-2">Host Panel</h3>

      <div className="space-y-1 text-xs max-h-64 overflow-y-auto">
        {participants?.map((p) => {
          const displayName = p.user?.nickName || p.userId.slice(0, 8);
          const profilePic = p.user?.profilePicture;

          return (
            <div
              key={p.id}
              className="flex justify-between items-center bg-slate-900/80 border border-slate-800 rounded-lg px-2 py-1"
            >
              {/* User Info */}
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-700">
                  {profilePic ? (
                    <Image
                      src={profilePic}
                      alt={displayName}
                      width={28}
                      height={28}
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px]">
                      ?
                    </div>
                  )}
                </div>

                <div>
                  <div className="font-medium text-slate-100">
                    {displayName} {p.isHost && "(Host)"}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {p.muted ? "Muted" : "Speaking"} · {p.id.slice(0, 10)}
                  </div>
                </div>
              </div>

              {/* Controls */}
              {!p.isHost && (
                <div className="flex gap-1">
                  <button
                    className="btn btn-sm bg-red-500/20 hover:bg-red-500/30"
                    onClick={() => onMute(p.userId, true)}
                  >
                    Mute
                  </button>

                  <button
                    onClick={() => onKick(p.userId)}
                    className="btn btn-danger text-xs px-2 py-1"
                  >
                    Kick
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ================================== */}
      {/* 🔴 KICK LIST PANEL */}
      {/* ================================== */}
      <div>
        <h3 className="font-semibold mb-2 text-lg">Kicked Users</h3>

        {loadingKicks && (
          <div className="text-sm text-slate-500">Loading…</div>
        )}

        {!loadingKicks && kicks.length === 0 && (
          <div className="text-sm text-slate-500">No kicked users</div>
        )}

        <div className="space-y-2">
          {kicks.map((k) => {
            const displayName =
              k.user?.nickName || k.user?.name || k.userId.slice(0, 8);
            const profilePic = k.user?.profilePicture;

            return (
              <div
                key={k.id}
                className="flex items-center justify-between p-2 bg-slate-800 rounded"
              >
                <div className="flex items-center gap-2">
                  {/* Avatar */}
                  <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-700">
                    {profilePic ? (
                      <Image
                         src={`${API_BASE}${profilePic}`}
                        alt={displayName}
                        width={28}
                        height={28}
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px]">
                        ?
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="font-medium">{displayName}</div>
                    <div className="text-xs text-slate-400">
                      until: {new Date(k.expiresAt).toLocaleString()}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleUnkick(k.userId)}
                  className="px-2 py-1 bg-blue-600 rounded text-xs"
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
