"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import WatchToggle from "@/components/WatchToggle";

interface ProfileHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: { text: string; color: string };
  entityType: string;
  entityId: number;
  entityLabel: string;
  watched: boolean;
  watchId: number | null;
}

export function ProfileHeader({ icon, title, subtitle, badge, entityType, entityId, entityLabel, watched, watchId }: ProfileHeaderProps) {
  const router = useRouter();
  return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="text-sm text-muted hover:text-foreground flex items-center gap-1 group">
        <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back
      </button>

      <div className="bg-gradient-to-br from-accent/8 via-card to-card border border-card-border rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
              {icon}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground tracking-tight">{title}</h1>
                {badge && (
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.color}`}>
                    {badge.text}
                  </span>
                )}
              </div>
              <p className="text-muted text-sm mt-1">{subtitle}</p>
            </div>
          </div>
          <WatchToggle entityType={entityType} entityId={entityId} entityLabel={entityLabel} initialWatched={watched} watchId={watchId} />
        </div>
      </div>
    </div>
  );
}

interface Tab {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface ProfileTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

export function ProfileTabs({ tabs, activeTab, onTabChange }: ProfileTabsProps) {
  return (
    <div className="border-b border-card-border">
      <div className="flex gap-0 -mb-px overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground hover:border-card-border"
            }`}
          >
            <span className="flex items-center gap-2">
              {tab.icon}
              {tab.label}
              {tab.count != null && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id ? "bg-accent/15 text-accent" : "bg-card-border text-muted"
                }`}>
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function DetailGrid({ items }: { items: [string, string | number | null | undefined][] }) {
  return (
    <div className="bg-card border border-card-border rounded-xl divide-y divide-card-border/50">
      {items.map(([label, val], i) => (
        <div key={label} className={`px-5 py-3 flex items-start gap-4 ${i % 2 === 0 ? "" : "bg-white/[0.01]"}`}>
          <span className="text-muted text-sm w-40 flex-shrink-0 font-medium">{label}</span>
          <span className="text-foreground text-sm">{(val as string) || "—"}</span>
        </div>
      ))}
    </div>
  );
}

export function DataSection({ title, empty, children }: { title: string; empty: string; children?: React.ReactNode }) {
  return children ? (
    <div>{children}</div>
  ) : (
    <div className="bg-card border border-card-border rounded-xl p-8 text-center">
      <p className="text-muted text-sm">{empty}</p>
    </div>
  );
}
