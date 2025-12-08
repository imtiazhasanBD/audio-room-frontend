"use client";

import { motion } from "framer-motion";
import clsx from "clsx";
import { Mic, MicOff, Lock, User, CheckCircle, Hourglass, Crown } from "lucide-react";
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

  function getModeIcon(mode: string) {
    switch (mode) {
      case "FREE":
        return <CheckCircle size={12} className="text-emerald-400" />;
      case "REQUEST":
        return <Hourglass size={12} className="text-yellow-400" />;
      case "LOCKED":
        return <Lock size={12} className="text-red-400" />;
      default:
        return null;
    }
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-3">
      {seats
        ?.sort((a, b) => a.index - b.index)
        ?.map((seat) => {
          const isMine = seat.userId === userId;
          const isHostSeat = seat.userId === hostId;
          const isEmpty = !seat.userId;

          const participant = participants.find((p) => p.userId === seat.userId);
          const isMuted = participant ? participant.muted : false;

          const rtcUid = participant?.rtcUid?.toString();
          const volume = rtcUid ? speakers[rtcUid] ?? 0 : 0;

          const isSpeaking = volume > 3 && !isMuted && !!seat.userId;

          const classes = clsx(
            "relative rounded-2xl w-36 h-32 border px-2 py-2 flex flex-col items-center justify-center text-xs sm:text-sm cursor-pointer transition-colors duration-300",
            {
              "border-slate-700 bg-slate-900/60 hover:border-emerald-500/60": isEmpty && seat.mode === "FREE",
              "border-yellow-400 bg-slate-900/70 hover:border-yellow-500": isEmpty && seat.mode === "REQUEST",
              "border-red-500/60 bg-slate-900/80 opacity-70": seat.mode === "LOCKED",
              "border-emerald-500/70 bg-emerald-500/10": isMine,
              "border-slate-700 bg-slate-900/90": !isMine && !isEmpty,
              "shadow-[0_0_20px_-5px_rgba(52,211,153,0.45)] border-emerald-400": isSpeaking,
            }
          );

          // Avatar info: show profilePicture if user exists
          const avatarUrl = seat.user?.profilePicture ?? null;
          const displayName =
            seat.user?.nickName ??
            (seat.userId ? seat.userId.slice(0, 6) : "Empty");

          return (
            <motion.div
              key={seat.id}
              onClick={() => onRequestSeat(seat.index)}
              className={classes}
              whileHover={{ scale: 1.02 }}
              layout
            >
              {/* ⚙ Host Seat Settings Button */}
              {userId === hostId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClickSeatAsHost?.(seat.index);
                  }}
                  className="absolute top-1 right-1 text-xs text-slate-400 hover:text-white"
                >
                  ⚙️
                </button>
              )}

              {/* 🏆 HOST BADGE */}
              {isHostSeat && (
                <div className="absolute top-1 left-1 bg-emerald-600 text-[10px] px-2 py-[2px] rounded-full flex items-center gap-1">
                  <Crown size={10} className="text-yellow-300" />
                  Host
                </div>
              )}

              {/* AVATAR */}
              <div className="relative mb-2">
                <motion.div
                  className={clsx(
                    "w-12 h-12 rounded-full flex items-center justify-center border-2 relative bg-slate-800 overflow-hidden transition-colors",
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
                      : { boxShadow: "0 0 0 0 rgba(0,0,0,0)", scale: 1 }
                  }
                  transition={{
                    duration: 1.1,
                    repeat: isSpeaking ? Infinity : 0,
                    ease: "easeInOut",
                  }}
                >
                  {isEmpty ? (
                    <span className="text-lg font-bold text-slate-200">
                      {seat.index}
                    </span>
                  ) : avatarUrl ? (
                    <img
                      src={`http://localhost:8000${avatarUrl}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="text-slate-400" size={20} />
                  )}
                </motion.div>

                {/* 🔇 ALWAYS SHOW SEAT MUTED BADGE (even empty) */}
                {seat.micOn === false && (
                  <div className="absolute -bottom-1 -right-1 bg-red-600 w-5 h-5 rounded-full flex items-center justify-center border border-slate-900 z-20">
                    <MicOff size={10} className="text-white" />
                  </div>
                )}

                {/* Mic Badge Only When User Present */}
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

              {/* NAME LABEL */}
              <div className="font-semibold text-slate-200 truncate max-w-full px-2">
                {isEmpty ? "Empty" : displayName}
              </div>

              {/* MODE LABEL */}
              {isEmpty && (
                <div className="flex items-center gap-1 text-[10px] mt-1 uppercase tracking-wider font-medium">
                  {getModeIcon(seat.mode)}
                  <span
                    className={clsx({
                      "text-emerald-400": seat.mode === "FREE",
                      "text-yellow-400": seat.mode === "REQUEST",
                      "text-red-400": seat.mode === "LOCKED",
                    })}
                  >
                    {seat.mode}
                  </span>
                </div>
              )}
            </motion.div>
          );
        })}
    </div>
  );
}
