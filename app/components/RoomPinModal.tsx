import { useState } from "react";

export default function RoomPinModal({
  open,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  error?: string;
  onSubmit: (pin: string) => void;
  onClose: () => void;
}) {
  const [pin, setPin] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-slate-900 p-5 rounded-lg w-80">
        <h2 className="text-lg font-bold mb-2">🔒 Room Locked</h2>
        <p className="text-sm text-slate-400 mb-3">
          Enter 6-digit room PIN
        </p>

        <input
          value={pin}
          onChange={(e) =>
            setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-center tracking-widest"
          placeholder="••••••"
        />

        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            disabled={pin.length !== 6}
            onClick={() => onSubmit(pin)}
            className="btn btn-primary"
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}
