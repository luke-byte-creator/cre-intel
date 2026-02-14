"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const PUBLIC_PATHS = ["/login", "/inquire"];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
      setAuthed(true);
      return;
    }

    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => {
        if (d.user) {
          setAuthed(true);
        } else {
          router.replace("/login");
        }
      })
      .catch(() => router.replace("/login"));
  }, [pathname, router]);

  if (authed === null && !PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{
          width: 32, height: 32,
          border: "2px solid #6366f1", borderTopColor: "transparent",
          borderRadius: "50%", animation: "spin 1s linear infinite"
        }} />
      </div>
    );
  }

  return <>{children}</>;
}
