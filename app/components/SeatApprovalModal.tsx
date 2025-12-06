"use client";

import { motion } from "framer-motion";

type SeatRequest = {
  id: string;
  userId: string;
  seatIndex?: number | null;
};

type Props = {
  open: boolean;
  requests: SeatRequest[];
  onApprove: (requestId: string) => void;
  onDeny: (requestId: string) => void;
  onClose: () => void;
};

export default function SeatApprovalModal({
  open,
  requests,
  onApprove,
  onDeny,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-slate-900 border border-slate-800 p-4 rounded-xl w-full max-w-md shadow-xl"
      >
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-sm font-semibold">Seat Requests</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        {requests.length === 0 ? (
          <p className="text-xs text-slate-400">No pending requests.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {requests.map((r) => (
              <div
                key={r.id}
                className="bg-slate-800/60 border border-slate-700 rounded-lg p-2 flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-medium">
                  {r.userId ? r.userId.slice(0, 6) : "Unknown"}

                  </div>
                  <div className="text-[11px] text-slate-400">
                    Requested seat:{" "}
                    {r.seatIndex !== null && r.seatIndex !== undefined
                      ? r.seatIndex + 1
                      : "Any seat"}
                  </div>
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => onApprove(r.id)}
                    className="btn btn-primary text-xs px-2 py-1"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => onDeny(r.id)}
                    className="btn btn-danger text-xs px-2 py-1"
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
