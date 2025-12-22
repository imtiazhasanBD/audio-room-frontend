"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearToken, getCurrentUser, getToken } from "@/app/lib/auth";
import { createRoomApi, fetchRooms, Room, RoomListItem } from "@/app/lib/api";

export default function RoomsPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [roomName, setRoomName] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    loadRooms();
  }, []);

  async function loadRooms() {
    try {
      const list = await fetchRooms();
      setRooms(list);
      console.log("list",list)
    } catch (err) {
      console.error("LOAD ROOMS ERR:", err);
    } finally {
      setLoading(false);
    }
  }

/*   async function handleCreate() {
    if (!roomName.trim()) return;
    try {
      const room = await createRoomApi(roomName, "AGORA");
      setRoomName("");
      setRooms((prev) => [room, ...prev]);
    } catch (err) {
      console.error(err);
      alert("Failed to create room");
    }
  } */

  function logout() {
    clearToken();
    router.push("/login");
  }

  const user = getCurrentUser();

  return (
    <div className="min-h-screen flex flex-col">
      {/* HEADER */}
      <header className="border-b border-slate-800 px-6 py-3 flex items-center justify-between bg-slate-950/90">
        <div>
          <span className="text-lg font-semibold">🎧 Audio Rooms</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          {user && (
            <span className="text-slate-300">
              Logged in as <b>{user.email ?? user.sub}</b>
            </span>
          )}
          <button className="btn" onClick={logout}>Logout</button>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-4">
        {/* CREATE */}
        <div className="card flex flex-col sm:flex-row sm:items-end gap-2">
          <div className="flex-1">
            <label className="block text-sm mb-1">Create new room (Host)</label>
            <input
              className="input"
              placeholder="Room name..."
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" >
            Create
          </button>
        </div>

        {/* ROOMS LIST */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Available Rooms</h2>

          {loading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : rooms.length === 0 ? (
            <p className="text-sm text-slate-500">No rooms yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {rooms.map((r) => (
                <button
                  key={r.id}
                  className="card hover:border-emerald-500/60 transition text-left"
                  onClick={() => router.push(`/room/${r.id}`)}
                >
                  {/* Room Header */}
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium">{r.name}</span>
                    <span className="badge">Live</span>
                  </div>

                  {/* Room Info */}
                  <p className="text-xs text-slate-400">
                    Host: {r.host.nickName}
                  </p>

                  <p className="text-xs text-slate-400">
                    Seats: {r.seatCount} • Users: {r.participantCount}
                  </p>

                  {r.tags?.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {r.tags.map((t) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 bg-slate-800 rounded text-[10px]"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
