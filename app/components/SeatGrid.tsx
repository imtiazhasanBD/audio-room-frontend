"use client";

import { motion } from "framer-motion";
import clsx from "clsx";
import { Mic, MicOff, Lock, User } from "lucide-react"; // ✅ Icons
import { Seat, Participant } from "../lib/api";
import { getCurrentUser } from "../lib/auth";

type Props = {
  seats: Seat[];
  hostId: string;
  onRequestSeat: (seatIndex: number) => void;
  onClickSeatAsHost?: (seatIndex: number) => void;
  speakers?: Record<string, number>;
  participants?: Participant[];
};

export function SeatGrid({
  seats,
  hostId,
  onRequestSeat,
  onClickSeatAsHost,
  speakers = {},
  participants = [],
}: Props) {
  const user = getCurrentUser();
  const userId = user?.id;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-3">
      {seats
        ?.sort((a, b) => a.index - b.index)
        ?.map((seat) => {
          // 1. Resolve State
          const isMine = seat.userId === userId;
          const isHostSeat = seat.userId === hostId;
          const isEmpty = !seat.userId;
          const isLocked = seat.locked;

          // Resolve Participant Data
          const participant = participants.find(
            (p) => p.userId === seat.userId
          );

          // Logic: Muted if seat says so OR participant data says so
          const isMuted = (!seat.micOn || participant?.muted) && !!seat.userId;
          
       const rtcUid = participant?.rtcUid?.toString();
const volume = rtcUid ? speakers[rtcUid] ?? 0 : 0;

// speaking = volume threshold AND not muted
const isSpeaking = volume > 3 && !isMuted && !!seat.userId;


          // 2. Dynamic Styles
          const base =
            "relative rounded-2xl w-36 h-32 border px-2 py-2 flex flex-col items-center justify-center text-xs sm:text-sm cursor-pointer transition-colors duration-300";

          const classes = clsx(base, {
            // Empty & Unlocked
            "border-slate-700 bg-slate-900/60 hover:border-emerald-500/60":
              isEmpty && !isLocked,

            // Locked
            "border-red-500/60 bg-slate-900/80 opacity-70": isLocked,

            // Mine
            "border-emerald-500/70 bg-emerald-500/10": isMine,

            // Occupied (Others)
            "border-slate-700 bg-slate-900/90": !isMine && !isEmpty,

            // ✅ SPEAKING GLOW (Outer Card)
            "isolate shadow-md": true,
"shadow-[0_0_20px_-5px_rgba(52,211,153,0.45)]": isSpeaking,
"border-emerald-400": isSpeaking,

          });

          // Labels
          const label = isEmpty
            ? "Empty"
            : isMine
            ? "You"
            : seat.userId?.slice(0, 6) || "User";

          const subLabel = isLocked ? "Locked" : isEmpty ? "Request" : "Listener";

          // Click Handler
          function handleClick() {
            if (userId === hostId && onClickSeatAsHost) {
              onClickSeatAsHost(seat.index);
            } else if (isEmpty && !isLocked) {
              onRequestSeat(seat.index);
            }
          }

          return (
            <motion.div
              key={seat.id}
              onClick={handleClick}
              className={classes}
              whileHover={{ scale: 1.02 }}
              layout
            >
              {/* ✅ AVATAR CIRCLE */}
              <div className="relative mb-2">
          <motion.div
  className={clsx(
    "w-12 h-12 rounded-full flex items-center justify-center border-2 relative bg-slate-800 transition-colors",
    isSpeaking
      ? "border-emerald-400"
      : isMine || isHostSeat
      ? "border-emerald-500/50"
      : "border-slate-700"
  )}
  animate={
    isSpeaking
      ? {
          boxShadow: [
            "0 0 0 0px rgba(52,211,153,0.5)",
            "0 0 8px 6px rgba(52,211,153,0.15)",
            "0 0 0 0px rgba(52,211,153,0.4)",
          ],
          scale: [1, 1.06, 1],
        }
      : {
          boxShadow: "0 0 0 0 rgba(0,0,0,0)",
          scale: 1,
        }
  }
  transition={{
    duration: 1.1,
    repeat: isSpeaking ? Infinity : 0,
    ease: "easeInOut",
  }}
>
  <span className="text-lg font-bold text-slate-200">
    {seat.index + 1}
  </span>
</motion.div>


                {/* ✅ MUTE/UNMUTE BADGE (Floating on Avatar) */}
                {!isEmpty && (
                  <div
                    className={clsx(
                      "absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center border border-slate-900 z-20",
                      isMuted ? "bg-red-500" : "bg-emerald-500"
                    )}
                  >
                    {isMuted ? (
                      <MicOff size={10} className="text-white" />
                    ) : (
                      <Mic size={10} className="text-white" />
                    )}
                  </div>
                )}
              </div>

              {/* Name */}
              <div className="font-semibold text-slate-200 truncate max-w-full px-2">
                {label}
              </div>

              {/* Status Text or Host Badge */}
              <div className="text-[10px] uppercase tracking-wider font-medium mt-1">
                {isHostSeat ? (
                    <span className="text-amber-400">Host</span>
                ) : isLocked ? (
                    <div className="flex items-center gap-1 text-red-400">
                        <Lock size={10} /> <span>Locked</span>
                    </div>
                ) : (
                    <span className="text-slate-500">{subLabel}</span>
                )}
              </div>
            </motion.div>
          );
        })}
    </div>
  );
}