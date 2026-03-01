"use client";

import { useState } from "react";
import InventoryTab from "./InventoryTab";
import VacancyTab from "./VacancyTab";

const TABS = [
  { id: "inventory", label: "Inventory" },
  { id: "vacancy", label: "Vacancy" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function IndustrialPage() {
  const [activeTab, setActiveTab] = useState<TabId>("inventory");

  return (
    <div className="space-y-6">
      {/* Tab Bar */}
      <div className="flex gap-6 border-b border-card-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-sm font-medium transition-colors relative ${
              activeTab === tab.id
                ? "text-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "inventory" && <InventoryTab />}
      {activeTab === "vacancy" && <VacancyTab />}
    </div>
  );
}
