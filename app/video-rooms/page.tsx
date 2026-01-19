"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMyRoom, fetchLiveRooms, fetchVideoRooms } from "@/app/lib/api";
import { getToken, getCurrentUser } from "@/app/lib/auth";

export default function VideoRoomsPage() {
  const router = useRouter();
  const user = getCurrentUser();

  const isHost = true;

  const [myRoom, setMyRoom] = useState<any | null>(null);
  const [liveRooms, setLiveRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  console.log(myRoom);
  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }

    Promise.all([fetchMyRoom(), fetchVideoRooms()])
      .then(([my, rooms]) => {
        setMyRoom(my);

        if (my) {
          setLiveRooms(rooms.filter((r: any) => r.id !== my.id));
        } else {
          setLiveRooms(rooms);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function goLiveApi() {
    const token = getToken();

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API}/video-room/go-live`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
    );
    console.log("gooooooooooooo", res);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || "Failed to go live");
    }

    /**
     * Expected response:
     * {
     *   room: {...},
     *   token: { provider, token, expiresAt },
     *   rtcUid: number
     * }
     */
    return res.json() as Promise<{
      room: any;
      token: {
        provider: string;
        token: string;
        expiresAt: string;
      };
      rtcUid: number;
    }>;
  }

  async function handleGoLive() {
    try {
      //  setGoingLive(true);
      const res = await goLiveApi();
      router.push(`/video-rooms/${res.room.id}?host=1`);
    } finally {
      // setGoingLive(false);
    }
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center text-white bg-black">
        Loading rooms...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 space-y-8">
      <h1 className="text-xl font-bold">📹 Live Video Rooms</h1>

      {/* ================= MY ROOM (HOST ONLY) ================= */}
      {myRoom && (
        <section>
          <h2 className="text-sm font-semibold text-emerald-400 mb-3">
            My Room
          </h2>

          {/* NOT LIVE */}
          {myRoom && (
            <button
              // disabled={myRoom?.isLive}
              onClick={handleGoLive}
              className="bg-emerald-600 hover:bg-emerald-700 px-5 py-3 rounded-lg font-medium disabled:opacity-50"
            >
              {myRoom.isLive ? "Going Live..." : "Go Live"}
            </button>
          )}

          {/* LIVE */}
          {myRoom && (
            <button
              onClick={() => router.push(`/video-rooms/${myRoom.id}?host=1`)}
              className="w-full bg-emerald-900/30 border border-emerald-600 rounded-lg p-4 text-left"
            >
              {myRoom.image && (
                <img
                  src={`https://meetalklive.com${myRoom.image}`}
                  className="w-full h-48 object-cover rounded mb-3"
                />
              )}

              <h3 className="font-semibold">{myRoom.title}</h3>
              <p className="text-xs text-slate-300">You are live</p>

              <span className="inline-flex items-center gap-1 text-xs text-red-400 mt-1">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                LIVE
              </span>
            </button>
          )}
        </section>
      )}

      {/* ================= LIVE ROOMS ================= */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 mb-3">
          Live Rooms
        </h2>

        {liveRooms.length === 0 && (
          <p className="text-slate-400 text-sm">No live rooms</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {liveRooms.map((room) => (
            <button
              key={room.id}
              onClick={() => router.push(`/video-rooms/${room.id}`)}
              className="bg-slate-900 border border-slate-700 rounded p-3 hover:border-red-500 text-left"
            >
              {room.image && (
                <img
                  src={`https://meetalklive.com${room.image}`}
                  className="h-40 w-full object-cover rounded mb-2"
                />
              )}

              <h3 className="font-semibold">{room.title}</h3>
              <p className="text-xs text-slate-400">
                Host: {room.host.nickName}
              </p>

              <span className="inline-flex items-center gap-1 text-xs text-red-400">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                LIVE
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
