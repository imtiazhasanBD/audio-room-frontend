"use client";

import Image from "next/image";
import { API_BASE, kickUserApi, Participant } from "../lib/api";

type HostPanelProps = {
  participants: Participant[];
  onBan: (userId: string) => void;
  onMute: (targetUserId: string, mute: boolean) => Promise<void>;
  onKick: (userId: string) => void;
};

export function HostPanel({
  participants,
  onBan,
  onMute,
  onKick,
}: HostPanelProps) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold mb-2">Host Panel</h3>
      <p className="text-xs text-slate-400 mb-2">
        Manage users: mute, kick, or ban.
      </p>

      <div className="space-y-1 text-xs max-h-64 overflow-y-auto">
        {participants?.map((p) => {
          const displayName = p.user?.nickName || p.userId.slice(0, 8);
          const profilePic = p.user?.profilePicture;

          return (
            <div
              key={p.id}
              className="flex justify-between items-center bg-slate-900/80 
              border border-slate-800 rounded-lg px-2 py-1"
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

                {/* Name & Status */}
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

                  <button
                    className="btn btn-danger text-xs px-2 py-1"
                    onClick={() => onBan(p.userId)}
                  >
                    Ban
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
