"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import NovaLogo from "@/components/NovaLogo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.ok) {
        router.replace("/");
      } else {
        setError(data.error || "Invalid credentials");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      {/* Subtle background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="bg-card border border-card-border rounded-2xl p-8 shadow-2xl shadow-black/20">
          {/* Logo + Title */}
          <div className="mb-8 text-center">
            <div className="flex justify-center mb-4">
              <NovaLogo size={48} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Nova Research
            </h1>
            <p className="text-xs text-muted mt-1.5 tracking-wide uppercase">CRE Intelligence Platform</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-muted mb-1.5">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2.5 bg-background border border-card-border rounded-lg text-sm text-foreground placeholder-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition"
                placeholder="name@cbre.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-muted mb-1.5">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 bg-background border border-card-border rounded-lg text-sm text-foreground placeholder-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-accent hover:bg-accent/90 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </span>
              ) : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] text-muted/40 mt-6">Nova Research · Internal Use Only</p>
      </div>
    </div>
  );
}
