"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginApi } from "../lib/api";
import { saveToken } from "../lib/auth";


export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await loginApi({ email, password });
      saveToken(res.token);
      router.push("/rooms");
    } catch (err: any) {
      console.error(err);
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-2">Login</h1>
        <p className="text-sm text-slate-400 mb-4">
          Log in to join or host audio rooms.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Password</label>
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
            />
          </div>
          {error && (
            <div className="text-sm text-red-400">
              {error}
            </div>
          )}
          <button
            type="submit"
            className="btn btn-primary w-full mt-2"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
