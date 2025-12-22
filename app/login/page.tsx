"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { API_BASE, loginApi } from "../lib/api";
import { saveToken } from "../lib/auth";
import { motion } from "framer-motion";
import { Mail, Lock, LogIn } from "lucide-react";

declare global {
  interface Window {
    handleGoogleLogin: (response: any) => void;
  }
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const GOOGLE_CLIENT_ID =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID 

  // =========================
  // EMAIL / PASSWORD LOGIN
  // =========================
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await loginApi({ email, password });
      saveToken(res.token);
      router.push("/rooms");
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // GOOGLE LOGIN CALLBACK
  // =========================
  useEffect(() => {
    window.handleGoogleLogin = async (response: any) => {
      try {
        const res = await fetch(
          `${API_BASE}/auth/google-verify`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              credential: response.credential,
            }),
          }
        );

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || "Google login failed");
        }

        saveToken(data.token);
        router.push("/rooms");
      } catch (err) {
        console.error(err);
        setError("Google login failed");
      }
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0c10] px-4">
      {/* Google Script */}
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <div className="bg-slate-900/40 border border-white/10 backdrop-blur-xl p-8 rounded-3xl shadow-2xl">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white mb-2">
              Welcome Back
            </h1>
            <p className="text-slate-400 text-sm">
              Join the conversation in real-time.
            </p>
          </div>

          {/* EMAIL LOGIN */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 uppercase">
                Email
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  size={18}
                />
                <input
                  className="w-full bg-slate-950 border border-white/5 rounded-xl py-3 pl-10 pr-4 text-white"
                  placeholder="email@example.com"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 uppercase">
                Password
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                  size={18}
                />
                <input
                  className="w-full bg-slate-950 border border-white/5 rounded-xl py-3 pl-10 pr-4 text-white"
                  placeholder="••••••••"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl flex justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={18} /> Login
                </>
              )}
            </button>
          </form>

          {/* DIVIDER */}
          <div className="my-8 text-center text-xs text-slate-500">
            OR CONTINUE WITH
          </div>

          {/* GOOGLE LOGIN */}
          <div className="flex justify-center">
            <div
              id="g_id_onload"
              data-client_id={GOOGLE_CLIENT_ID}
              data-callback="handleGoogleLogin"
              data-auto_prompt="false"
            />
            <div
              className="g_id_signin"
              data-type="standard"
              data-theme="filled_black"
              data-size="large"
              data-shape="pill"
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
