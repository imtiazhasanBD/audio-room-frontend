"use client";

import { Socket } from "socket.io-client";
import { Participant, removeUserFromSeatApi } from "../lib/api";
import { useState } from "react";

type SeatMode = "FREE" | "REQUEST" | "LOCKED";

interface SeatModeModalProps {
  open: boolean;
  seatIndex: number | null;
  onClose: () => void;
  onChangeMode: (mode: SeatMode) => void;
  OnBulkSeatMode: (mode: SeatMode) => void;
  onMuteSeat: (seatIndex: number, mute: boolean) => void;
    participants: Participant[];
  socket: Socket | null;
  userId: string;
  roomId: string;
}

export default function SeatModeModal({
  open,
  seatIndex,
  onClose,
  onChangeMode,
  OnBulkSeatMode,
  onMuteSeat,
    participants,
    userId,
  socket,
  roomId,
}: SeatModeModalProps) {
  if (!open || seatIndex === null) return null;
    const [inviteOpen, setInviteOpen] = useState(false);
      const [showInviteList, setShowInviteList] = useState(false);


  // Seat number for display (1-based)
  const seatNumber = seatIndex + 1;
    // Only users WITHOUT seats
   function inviteUser(userId: string) {
    if (!socket) return;

    socket.emit("seat.invite", {
      roomId,
      seatIndex,
      targetUserId: userId,
    });

    setInviteOpen(false);
    onClose();
  }
console.log("remove user id", userId)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 p-4 rounded-xl w-64">
        <h2 className="font-bold mb-3 text-center">
          Seat {seatNumber} Controls
        </h2>

        {/* ===== Seat Mode Controls ===== */}
        <button
          className="w-full py-2 bg-emerald-600 rounded mb-2"
          onClick={() => onChangeMode("FREE")}
        >
          FREE (Instant Join)
        </button>

        <button
          className="w-full py-2 bg-yellow-600 rounded mb-2"
          onClick={() => onChangeMode("REQUEST")}
        >
          REQUEST (Approval Needed)
        </button>

        <button
          className="w-full py-2 bg-red-600 rounded mb-2"
          onClick={() => onChangeMode("LOCKED")}
        >
          LOCKED (Disabled)
        </button>

        {/* ===== Seat Mute / Unmute ===== */}
        <button
          className="w-full py-2 bg-orange-600 rounded mb-2"
          onClick={() => onMuteSeat(seatIndex, true)}
        >
          🔇 Mute Seat
        </button>

        <button
          className="w-full py-2 bg-green-600 rounded mb-2"
          onClick={() => onMuteSeat(seatIndex, false)}
        >
          🔊 Unmute Seat
        </button>
     {/* 🔥 INVITE BUTTON */}
        <button
          className="btn btn-primary w-full"
          onClick={() => setShowInviteList(true)}
        >
          Invite User
        </button>
       {/* INVITE USER LIST */}
        {showInviteList && (
          <div className="border-t border-slate-700 pt-2">
            <p className="text-sm mb-2 text-slate-300">
              Select user to invite
            </p>

            <div className="max-h-40 overflow-y-auto space-y-1">
              {participants.length === 0 && (
                <p className="text-xs text-slate-500">
                  No available users
                </p>
              )}

              {participants.map((u) => (
                <button
                  key={u.userId}
                  onClick={() => inviteUser(u.userId)}
                  className="w-full flex items-center gap-2 p-2 rounded hover:bg-slate-800 text-left"
                >
                  <img
                    src={u.user.profilePicture || "/avatar.png"}
                    className="w-6 h-6 rounded-full"
                  />
                  <span className="text-sm">
                    {u.user.nickName}
                  </span>
                </button>
              ))}
            </div>

          </div>
        )}
         {userId && (
            <button
  className="btn btn-warning w-full mt-2 bg-red-900 rounded"
  onClick={() => removeUserFromSeatApi(roomId, userId)}
>
  Remove from seat
</button>
            )}
        <button
          className="w-full mt-3 py-2 bg-slate-600 rounded"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
