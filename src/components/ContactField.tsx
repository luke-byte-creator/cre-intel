"use client";

import { useState, useEffect, useCallback } from "react";

export function ContactField({ personId, field, value, placeholder }: { personId: number; field: string; value: string | null; placeholder: string }) {
  const [val, setVal] = useState(value || "");

  useEffect(() => { setVal(value || ""); }, [value]);

  const save = useCallback(() => {
    const trimmed = val.trim();
    if (trimmed === (value || "")) return;
    fetch(`/api/people/${personId}/contact`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: trimmed || null }),
    });
  }, [val, value, personId, field]);

  return (
    <input
      type="text"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={save}
      placeholder={placeholder}
      className="w-full bg-transparent border-0 border-b border-transparent focus:border-card-border text-sm text-foreground placeholder:text-muted/50 outline-none py-1 px-0 transition-colors focus:bg-card/50 rounded-none"
    />
  );
}
