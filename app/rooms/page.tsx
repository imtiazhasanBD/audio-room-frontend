"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearToken, getCurrentUser, getToken } from "@/app/lib/auth";
import { createRoomApi, fetchRooms, Room } from "@/app/lib/api";

export default function RoomsPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [roomName, setRoomName] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    loadRooms();
  }, []);

  async function loadRooms() {
    try {
      const data = await fetchRooms();
      setRooms(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!roomName.trim()) return;
    try {
      const room = await createRoomApi(roomName, "AGORA");
      setRoomName("");
      setRooms((prev) => [room, ...prev]);
    } catch (err) {
      console.error(err);
      alert("Failed to create room");
    }
  }

  function logout() {
    clearToken();
    router.push("/login");
  }

  const user = getCurrentUser();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 px-6 py-3 flex items-center justify-between bg-slate-950/90">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">🎧 Audio Rooms</span>
          <span className="badge">Beta</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {user && (
            <span className="text-slate-300">
              Logged in as <b>{user.username || user.sub}</b>
            </span>
          )}
          <button className="btn" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-4">
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
          <button className="btn btn-primary" onClick={handleCreate}>
            Create
          </button>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Available Rooms</h2>
          {loading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : rooms.length === 0 ? (
            <p className="text-sm text-slate-500">
              No rooms yet. Be the first to create one.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {rooms.map((r) => (
                <button
                  key={r.id}
                  className="card text-left hover:border-emerald-500/60 hover:shadow-emerald-500/10 transition"
                  onClick={() => router.push(`/room/${r.id}`)}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium">{r.name}</span>
                    <span className="badge">
                      {r.isLive ? "Live" : "Ended"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    ID: {r.id.slice(0, 8)}... • Host: {r.hostId.slice(0, 6)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
