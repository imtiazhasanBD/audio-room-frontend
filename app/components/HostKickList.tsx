"use client";

import { useEffect, useState } from "react";
import { getKickListApi, unkickApi } from "../lib/api";
import { useParams } from "next/navigation";

export type KickItem = {
  id: string;
  userId: string;
  bannedBy: string;
  expiresAt: string;
  user?: { id: string; name?: string; email?: string };
};

export default function HostKickList() {
  const params = useParams<{ id: string }>();
  const roomId = params.id;
  const [list, setList] = useState<KickItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const kicks = await getKickListApi(roomId);
      setList(kicks);
    } catch (e) {
      console.error("Failed load kicks", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [roomId]);

  const handleUnkick = async (userId: string) => {
    if (!confirm("Unban this user so they can rejoin now?")) return;
    try {
      await unkickApi(roomId, userId);
      setList((prev) => prev.filter((p) => p.userId !== userId));
    } catch (e) {
      console.error("Unkick failed", e);
      alert("Failed to unkick");
    }
  };

  return (
    <div className="card">
      <h3 className="font-semibold mb-2">Kicked users</h3>

      {loading && <div className="text-sm text-slate-400">Loading…</div>}

      {!loading && list.length === 0 && (
        <div className="text-sm text-slate-400">No kicked users</div>
      )}

      <div className="space-y-2">
        {list.map((k) => (
          <div key={k.id} className="flex items-center justify-between p-2 bg-slate-900 rounded">
            <div>
              <div className="font-medium">{k.user?.name || k.userId}</div>
              <div className="text-xs text-slate-400">
                expires: {new Date(k.expiresAt).toLocaleString()}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleUnkick(k.userId)}
                className="btn btn-sm"
              >
                Unkick
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
