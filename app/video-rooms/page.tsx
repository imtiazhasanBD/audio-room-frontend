"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchVideoRooms } from "@/app/lib/api";
import { getToken } from "@/app/lib/auth";

export default function VideoRoomsPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }

    fetchVideoRooms()
      .then(setRooms)
      .finally(() => setLoading(false));
  }, []);
console.log(rooms[0])
  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <h1 className="text-xl font-bold mb-4">📹 Live Video Rooms</h1>

      {loading && <p>Loading...</p>}

      {!loading && rooms.length === 0 && <p>No live rooms</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => router.push(`/video-rooms/${room.id}`)}
            className="bg-slate-900 border border-slate-700 rounded p-3 hover:border-emerald-500 text-left"
          >
            {room.image && (
              <img
                src={`https://meetalklive.com${room.image}`}
                className="h-40 w-full object-cover rounded mb-2"
              />
            )}

            <h2 className="font-semibold">{room.title}</h2>
            <p className="text-xs text-slate-400">
              Host: {room.host.nickName}
            </p>
            <p className="text-xs text-slate-400">
              Viewers: {room.participantCount}
            </p>

            <span className="text-xs text-green-400">LIVE</span>
          </button>
        ))}
      </div>
    </div>
  );
}
