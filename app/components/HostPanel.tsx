"use client";

import { Participant } from "../lib/api";



type HostPanelProps = {
  participants: Participant[];
  onBan: (userId: string) => void;
  onMute: (userId: string) => void;
  onKick: (userId: string) => void;
};

export function HostPanel({ participants, onBan, onMute, onKick }: HostPanelProps) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold mb-2">Host Panel</h3>
      <p className="text-xs text-slate-400 mb-2">
        Manage users: mute, kick, or ban.
      </p>
      <div className="space-y-1 text-xs max-h-64 overflow-y-auto">
        {participants?.map((p) => (
          <div
            key={p.id}
            className="flex justify-between items-center bg-slate-900/80 border border-slate-800 rounded-lg px-2 py-1"
          >
            <div>
              <div className="font-medium text-slate-100">
                {p.userId.slice(0, 8)} {p.isHost && "(Host)"}
              </div>
              <div className="text-[11px] text-slate-400">
                {p.muted ? "Muted" : "Speaking"} · {p.id.slice(0, 10)}
              </div>
            </div>
            {!p.isHost && (
              <div className="flex gap-1">
                <button
                  className="btn text-xs py-1 px-2"
                  onClick={() => onMute(p.userId)}
                >
                  {p.muted ? "Unmute" : "Mute"}
                </button>
                <button
                  className="btn text-xs py-1 px-2"
                  onClick={() => onKick(p.userId)}
                >
                  Kick
                </button>
                <button
                  className="btn btn-danger text-xs py-1 px-2"
                  onClick={() => onBan(p.userId)}
                >
                  Ban
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
