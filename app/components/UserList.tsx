"use client";

import { Participant } from "../lib/api";
import { getCurrentUser } from "../lib/auth";



type Props = {
  participants: Participant[];
};

export function UserList({ participants }: Props) {
  const me = getCurrentUser();
  return (
    <div className="card">
      <h3 className="text-sm font-semibold mb-2">Users in room</h3>
      <ul className="space-y-1 text-xs">
        {participants?.map((p) => (
          <li
            key={p.id}
            className="flex justify-between items-center text-slate-300"
          >
            <span>
              {p.userId.slice(0, 8)}
              {p.userId === me?.sub && <span className="text-emerald-400 ml-1">(you)</span>}
            </span>
            <span className="text-slate-400">
              {p.isHost ? "Host" : "Guest"}
              {p.muted ? " · Muted" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
