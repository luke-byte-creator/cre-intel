"use client";

import { useState, useEffect } from "react";

export default function SettingsPage() {
  const [user, setUser] = useState<{ name: string; email: string; role: string } | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(data => {
      if (data.user) setUser(data.user);
    });
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "New passwords don't match" });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ type: "error", text: "Password must be at least 6 characters" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: "Password updated" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setMessage({ type: "error", text: data.error || "Failed to update password" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to update password" });
    }
    setSaving(false);
  };

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <h1 className="text-xl font-bold text-foreground mb-6">Account Settings</h1>

      {user && (
        <div className="bg-card border border-card-border rounded-xl p-5 mb-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted text-xs block mb-0.5">Name</span>
              <span className="text-foreground">{user.name}</span>
            </div>
            <div>
              <span className="text-muted text-xs block mb-0.5">Email</span>
              <span className="text-foreground">{user.email}</span>
            </div>
            <div>
              <span className="text-muted text-xs block mb-0.5">Role</span>
              <span className="text-foreground capitalize">{user.role}</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-card-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="text-xs text-muted block mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              required
              className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/50"
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/50"
            />
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              className="w-full bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-accent/50"
            />
          </div>

          {message && (
            <p className={`text-xs ${message.type === "success" ? "text-green-400" : "text-red-400"}`}>
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
          >
            {saving ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
