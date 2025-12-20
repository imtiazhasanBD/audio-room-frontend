"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { loginApi } from "../lib/api";
import { saveToken } from "../lib/auth";
import { motion } from "framer-motion";
import { Mail, Lock, LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const GOOGLE_CLIENT_ID = "729799433930-n8srt06sdicha4jhsan8khtk52vj8qev.apps.googleusercontent.com";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await loginApi({ email, password });
      saveToken(res.token);
      router.push("/rooms");
    } catch (err: any) {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0c10] bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0c10] to-[#0a0c10] px-4">
      {/* Google Identity Services Script */}
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <div className="relative bg-slate-900/40 border border-white/10 backdrop-blur-2xl p-8 rounded-3xl shadow-2xl">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Welcome Back</h1>
            <p className="text-slate-400 text-sm">Join the conversation in real-time.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400 ml-1 uppercase tracking-wider">Email</label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={18} />
                <input
                  className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  type="email"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-400 ml-1 uppercase tracking-wider">Password</label>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={18} />
                <input
                  className="w-full bg-slate-950/40 border border-white/5 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  type="password"
                />
              </div>
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs py-2.5 px-3 rounded-lg text-center font-medium">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={18} />
                  Login
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/5"></span>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-[#11141b] px-3 text-slate-500 tracking-[0.2em] font-bold">Secure Social Login</span>
            </div>
          </div>

          {/* Google Sign In Container */}
          <div className="flex flex-col items-center gap-4">
            <div 
              id="g_id_onload"
              data-client_id={GOOGLE_CLIENT_ID}
              data-login_uri="http://localhost:8000/auth/google/verify"
              data-auto_prompt="false"
            />
            <div 
              className="g_id_signin w-full" 
              data-type="standard" 
              data-shape="pill" 
              data-theme="filled_black" 
              data-size="large" 
              data-logo_alignment="left"
              data-width="100%"
            />
          </div>
        </div>

        <p className="text-center text-slate-500 text-sm mt-8 font-medium">
          Don&apos;t have an account? <span className="text-blue-500 hover:text-blue-400 transition-colors cursor-pointer">Create Account</span>
        </p>
      </motion.div>
    </div>
  );
}