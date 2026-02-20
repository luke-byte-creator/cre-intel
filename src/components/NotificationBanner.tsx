"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface NotificationCounts {
  emailDrafts: number;
  pendingComps: number;
  totalNotifications: number;
}

export default function NotificationBanner() {
  const [counts, setCounts] = useState<NotificationCounts>({ emailDrafts: 0, pendingComps: 0, totalNotifications: 0 });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetchCounts();
    
    // Poll every 30 seconds for updates
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchCounts = async () => {
    try {
      const response = await fetch("/api/notifications/counts");
      if (response.ok) {
        const data = await response.json();
        setCounts(data);
        
        // Reset dismissed state if we have new notifications
        if (data.totalNotifications > 0) {
          setDismissed(false);
        }
      }
    } catch (error) {
      console.error("Failed to fetch notification counts:", error);
    }
  };

  // Don't show if no notifications or user dismissed
  if (counts.totalNotifications === 0 || dismissed) {
    return null;
  }

  return (
    <div className="mb-6 bg-gradient-to-r from-accent/10 to-accent/5 border border-accent/20 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <div>
            <div className="font-medium text-foreground">
              Nova has processed {counts.totalNotifications} item{counts.totalNotifications !== 1 ? 's' : ''} for your review
            </div>
            <div className="text-sm text-muted mt-1">
              {counts.emailDrafts > 0 && (
                <span>
                  <Link href="/drafts" className="text-accent hover:underline">
                    {counts.emailDrafts} draft{counts.emailDrafts !== 1 ? 's' : ''} ready
                  </Link>
                  {counts.pendingComps > 0 && ' • '}
                </span>
              )}
              {counts.pendingComps > 0 && (
                <Link href="/comps/pending" className="text-accent hover:underline">
                  {counts.pendingComps} comp{counts.pendingComps !== 1 ? 's' : ''} pending review
                </Link>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {counts.emailDrafts > 0 && (
            <Link
              href="/drafts"
              className="px-3 py-1.5 bg-accent text-white text-sm rounded hover:bg-accent/90 transition-colors"
            >
              Review Drafts
            </Link>
          )}
          {counts.pendingComps > 0 && (
            <Link
              href="/comps/pending"
              className="px-3 py-1.5 bg-accent text-white text-sm rounded hover:bg-accent/90 transition-colors"
            >
              Review Comps
            </Link>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-muted hover:text-foreground transition-colors"
            title="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}