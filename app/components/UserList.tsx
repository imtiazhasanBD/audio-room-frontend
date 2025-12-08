"use client";

import Image from "next/image";
import { API_BASE, Participant } from "../lib/api";
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
        {participants?.map((p) => {
          const isMe = p.userId === me?.sub;
          const displayName = p.user?.nickName || p.userId.slice(0, 8);
          const profilePic = p.user?.profilePicture;

          return (
            <li
              key={p.id}
              className="flex items-center justify-between text-slate-300"
            >
              <div className="flex items-center space-x-2">
                {/* Profile Picture */}
                <div className="w-6 h-6 rounded-full overflow-hidden bg-slate-700">
                  {profilePic ? (
                    <Image
                       src={`${API_BASE}${profilePic}`}
                      alt={displayName}
                      width={24}
                      height={24}
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px]">
                      ?
                    </div>
                  )}
                </div>

                {/* Name + (you) */}
                <span>
                  {displayName}
                  {isMe && <span className="text-emerald-400 ml-1">(you)</span>}
                </span>
              </div>

              {/* Host / Guest + Muted */}
              <span className="text-slate-400">
                {p.isHost ? "Host" : "Guest"}
                {p.muted ? " · Muted" : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
