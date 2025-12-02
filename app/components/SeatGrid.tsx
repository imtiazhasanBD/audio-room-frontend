"use client";

import { motion } from "framer-motion";
import clsx from "clsx";
import { Seat } from "../lib/api";
import { getCurrentUser } from "../lib/auth";

type Props = {
  seats: Seat[];
  hostId: string;
  onRequestSeat: (seatIndex: number) => void;
  onClickSeatAsHost?: (seatIndex: number) => void;
};

export function SeatGrid({ seats, hostId, onRequestSeat, onClickSeatAsHost }: Props) {
  const user = getCurrentUser();
  const userId = user?.id;
  

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-3">
      {seats
        ?.sort((a, b) => a.index - b.index)
        ?.map((seat) => {
          const isMine = seat.userId === userId;
          const isHostSeat = seat.userId === hostId;
          const isEmpty = !seat.userId;
          const isLocked = seat.locked;
          const isMuted = !seat.micOn && !!seat.userId;

          const base = "rounded-2xl w-36 border px-2 py-2 flex flex-col items-center justify-center text-xs sm:text-sm cursor-pointer transition";
          const classes = clsx(base, {
            "border-slate-700 bg-slate-900/60 hover:border-emerald-500/60": isEmpty && !isLocked,
            "border-red-500/60 bg-slate-900/80": isLocked,
            "border-emerald-500/70 bg-emerald-500/10": isMine,
            "border-slate-700 bg-slate-900/90": !isMine && !isEmpty,
          });

          const label = isEmpty ? "Empty" : isMine ? "You" : seat.userId?.slice(0, 6);
          const subLabel = isLocked ? "Locked" : isEmpty ? "Tap to request" : isHostSeat ? "Host" : isMuted ? "Muted" : "On mic";

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
              whileHover={{ scale: 1.03 }}
            >
              <div
                className={clsx(
                  "w-10 h-10 rounded-full flex items-center justify-center mb-1",
                  isMine || isHostSeat
                    ? "bg-emerald-500/20 border border-emerald-400/60"
                    : "bg-slate-800/80 border border-slate-600/60"
                )}
              >
                <span className="text-[11px] font-semibold">
                  {seat.index + 1}
                </span>
              </div>
              <div className="font-medium">{label}</div>
              <div className="text-[11px] text-slate-400">{subLabel}</div>
            </motion.div>
          );
        })}
    </div>
  );
}
