"use client";

import Image from "next/image";
import { Participant } from "../lib/api";
import { getCurrentUser } from "../lib/auth";

type Props = {
  participants: Participant[];
};

export function UserList({ participants }: Props) {
  const me = getCurrentUser();

  // --- Helper Function ---
  const getImageSrc = (src?: string | null) => {
    if (!src) return null; // Return null so we can show the fallback UI

    // Absolute URL (Google, Facebook, etc.)
    if (src.startsWith("http://") || src.startsWith("https://")) {
      return src;
    }

    // Relative URL (your backend)
    return `https://meetalklive.com${src}`;
  };

  // Helper to determine gender color
  const getGenderColor = (gender: string = "male") => {
    return gender === "female" ? "bg-pink-600" : "bg-blue-600";
  };

  return (
    <div className="card">
      <h3 className="text-sm font-semibold mb-2">Users in room</h3>
      <ul className="space-y-2 text-xs">
        {participants?.map((p) => {
          const isMe = p.userId === me?.sub;
          const user = p.user;
          const displayName = user?.nickName || p.userId.slice(0, 8);
          
          // Use the helper here
          const profilePicSrc = getImageSrc(user?.profilePicture);
          const gender = user?.gender || "male";

          return (
            <li
              key={p.id}
              className="flex items-center justify-between text-slate-300 bg-slate-800/50 p-2 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                {/* Profile Picture or Fallback Avatar */}
                <div className="relative w-8 h-8 rounded-full overflow-hidden border border-slate-600 shrink-0">
                  {profilePicSrc ? (
                    <Image
                      src={profilePicSrc}
                      alt={displayName}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center font-bold text-white ${getGenderColor(gender)}`}>
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Name + (you) */}
                <div className="flex flex-col">
                  <span className="font-medium text-slate-200">
                    {displayName}
                    {isMe && <span className="text-emerald-400 text-[10px] ml-1">(you)</span>}
                  </span>
                  {/* ID or Role */}
                  <span className="text-[10px] text-slate-500">ID: {user?.id.slice(0, 6)}...</span>
                </div>
              </div>

              {/* Status Tags */}
              <div className="flex flex-col items-end gap-1">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${p.isHost ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-slate-700 text-slate-400"}`}>
                  {p.isHost ? "Host" : "Guest"}
                </span>
                {p.muted && (
                  <span className="text-[10px] text-red-400 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M1 1l22 22"/><path d="M9 9v3a3 3 0 0 1-5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/></svg>
                    Muted
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}