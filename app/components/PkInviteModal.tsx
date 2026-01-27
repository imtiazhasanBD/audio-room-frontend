"use client";

import { useEffect, useState } from "react";
import { fetchLiveRooms, sendPkInviteApi } from "@/app/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function PkInviteModal({ open, onClose }: Props) {
  // Use the 'items' property from your JSON
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    fetchLiveRooms()
      .then((data) => {
        // Access data.items based on your provided JSON structure
        setRooms(data?.items || []);
      })
      .catch((err) => console.error("Fetch error:", err))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
      <div className="bg-gray-900 w-full max-w-md rounded-xl p-5 text-white">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Invite to PK</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        {loading && <p className="text-gray-400">Loading live rooms...</p>}
        {!loading && rooms.length === 0 && <p className="text-gray-500">No live rooms found.</p>}

        <div className="max-h-[400px] overflow-y-auto space-y-3">
          {rooms.map((room) => (
            <div
              key={room.roomId} // Changed from room.id to room.roomId
              className="flex items-center justify-between bg-gray-800 p-3 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <img
                  // Changed from room.coverImage to room.image
                  src={room.image || "/placeholder.jpg"}
                  alt={room.title}
                  className="w-12 h-12 rounded-lg object-cover bg-gray-700"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{room.title}</p>
                  <p className="text-xs text-gray-400">
                    Host: {room.host?.nickName || "Unknown"}
                  </p>
                </div>
              </div>

              <button
                disabled={sending === room.roomId} // Changed to roomId
                onClick={async () => {
                  setSending(room.roomId);
                  try {
                    await sendPkInviteApi(room.roomId);
                    alert("PK invite sent!");
                    onClose();
                  } catch (e: any) {
                    alert(e?.response?.data?.message || "Failed to invite");
                  } finally {
                    setSending(null);
                  }
                }}
                className="bg-pink-600 hover:bg-pink-500 px-4 py-1.5 rounded-full text-sm font-medium disabled:opacity-50 shrink-0 ml-2"
              >
                {sending === room.roomId ? "..." : "Invite"}
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full py-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}