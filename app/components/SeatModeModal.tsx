"use client";

type SeatMode = "FREE" | "REQUEST" | "LOCKED";

interface SeatModeModalProps {
  open: boolean;
  seatIndex: number | null;
  onClose: () => void;
  onChangeMode: (mode: SeatMode) => void;
  OnBulkSeatMode: (mode: SeatMode) => void;
  onMuteSeat: (seatIndex: number, mute: boolean) => void;
}

export default function SeatModeModal({
  open,
  seatIndex,
  onClose,
  onChangeMode,
  OnBulkSeatMode,
  onMuteSeat,
}: SeatModeModalProps) {
  if (!open || seatIndex === null) return null;

  // Seat number for display (1-based)
  const seatNumber = seatIndex + 1;

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

        <button
          className="btn btn-secondary w-full"
          onClick={() => OnBulkSeatMode("REQUEST")}
        >
          Make All Free Seats → Request-Only
        </button>

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
