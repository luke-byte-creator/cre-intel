"use client";

export default function WatchlistPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Watchlist</h1>
        <p className="text-muted text-sm mt-1">Track entities you&apos;re monitoring</p>
      </div>
      <div className="bg-card border border-card-border rounded-xl p-12 text-center">
        <p className="text-4xl mb-4">👁</p>
        <p className="text-foreground font-medium mb-2">Coming Soon</p>
        <p className="text-muted text-sm">Your watchlist will appear here.</p>
      </div>
    </div>
  );
}
