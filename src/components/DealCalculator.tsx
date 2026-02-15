"use client";

import { useState, useMemo } from "react";

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function InputField({ label, value, onChange, suffix, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; suffix?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-zinc-400 block mb-1">{label}</label>
      <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden focus-within:border-blue-500 transition">
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || "0"}
          className="flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {suffix && <span className="text-xs text-zinc-500 pr-3 flex-shrink-0">{suffix}</span>}
      </div>
    </div>
  );
}

function OutputRow({ label, value, color = "text-zinc-200" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-700/50 last:border-0">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}

export default function DealCalculator() {
  const [sf, setSf] = useState("5000");
  const [baseRent, setBaseRent] = useState("20");
  const [term, setTerm] = useState("60");
  const [freeRent, setFreeRent] = useState("3");
  const [ti, setTi] = useState("15");
  const [commRate, setCommRate] = useState("5");
  const [escalation, setEscalation] = useState("0");

  const calc = useMemo(() => {
    const s = parseFloat(sf) || 0;
    const br = parseFloat(baseRent) || 0;
    const t = parseFloat(term) || 0;
    const fr = parseFloat(freeRent) || 0;
    const tiVal = parseFloat(ti) || 0;
    const cr = (parseFloat(commRate) || 0) / 100;
    const esc = (parseFloat(escalation) || 0) / 100;

    if (s === 0 || t === 0) return null;

    let totalRent = 0;
    const paidMonths = Math.max(0, t - fr);

    if (esc === 0) {
      totalRent = br * s * paidMonths / 12;
    } else {
      // Month-by-month with annual escalation
      for (let m = 0; m < t; m++) {
        if (m < fr) continue; // free rent period
        const year = Math.floor(m / 12);
        const monthlyRent = (br * Math.pow(1 + esc, year)) * s / 12;
        totalRent += monthlyRent;
      }
    }

    const tiCost = tiVal * s;
    const freeRentValue = br * s * fr / 12;
    const totalConcessions = freeRentValue + tiCost;
    const termYears = t / 12;
    const nerYear = (totalRent - tiCost) / termYears / s;
    const nerMonth = nerYear / 12;
    const commission = cr * totalRent;
    const landlordNet = totalRent - totalConcessions - commission;
    const concessionPct = totalRent > 0 ? (totalConcessions / totalRent) * 100 : 0;

    // Breakdown for bar
    const netCollected = totalRent - freeRentValue;
    const barTotal = netCollected + freeRentValue + tiCost + commission;

    return {
      totalRent, totalConcessions, nerYear, nerMonth, commission, landlordNet, concessionPct,
      freeRentValue, tiCost,
      bar: barTotal > 0 ? {
        rent: (netCollected / barTotal) * 100,
        free: (freeRentValue / barTotal) * 100,
        ti: (tiCost / barTotal) * 100,
        comm: (commission / barTotal) * 100,
      } : null,
    };
  }, [sf, baseRent, term, freeRent, ti, commRate, escalation]);

  return (
    <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-5">
      <h3 className="text-base font-semibold text-white mb-4">Deal Economics Calculator</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="space-y-3">
          <InputField label="Lease Area" value={sf} onChange={setSf} suffix="SF" />
          <InputField label="Base Rent" value={baseRent} onChange={setBaseRent} suffix="$/SF/yr" />
          <InputField label="Lease Term" value={term} onChange={setTerm} suffix="months" />
          <InputField label="Free Rent" value={freeRent} onChange={setFreeRent} suffix="months" />
          <InputField label="TI Allowance" value={ti} onChange={setTi} suffix="$/SF" />
          <InputField label="Commission Rate" value={commRate} onChange={setCommRate} suffix="%" />
          <InputField label="Annual Escalation" value={escalation} onChange={setEscalation} suffix="%" />
        </div>

        {/* Outputs */}
        <div>
          {calc ? (
            <div className="space-y-1">
              <OutputRow label="Total Lease Value" value={`$${fmt(calc.totalRent)}`} color="text-emerald-400" />
              <OutputRow label="Total Concessions" value={`$${fmt(calc.totalConcessions)}`} color="text-amber-400" />
              <OutputRow label="Net Effective Rent" value={`$${fmt(calc.nerYear)}/SF/yr`} color="text-white" />
              <OutputRow label="Net Effective Rent" value={`$${fmt(calc.nerMonth)}/SF/mo`} color="text-white" />
              <OutputRow label="Landlord Net Position" value={`$${fmt(calc.landlordNet)}`} color={calc.landlordNet >= 0 ? "text-emerald-400" : "text-red-400"} />
              <OutputRow label="Your Commission" value={`$${fmt(calc.commission)}`} color="text-emerald-400" />
              <OutputRow label="Concession as % of Lease" value={`${fmt(calc.concessionPct)}%`} color="text-amber-400" />

              {/* Breakdown bar */}
              {calc.bar && (
                <div className="pt-4">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Value Breakdown</p>
                  <div className="flex h-4 rounded-full overflow-hidden">
                    <div className="bg-emerald-500" style={{ width: `${calc.bar.rent}%` }} title="Rent Collected" />
                    <div className="bg-amber-500" style={{ width: `${calc.bar.free}%` }} title="Free Rent" />
                    <div className="bg-orange-500" style={{ width: `${calc.bar.ti}%` }} title="TI Allowance" />
                    <div className="bg-blue-500" style={{ width: `${calc.bar.comm}%` }} title="Commission" />
                  </div>
                  <div className="flex gap-4 mt-2 flex-wrap">
                    <span className="text-[10px] text-zinc-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Rent</span>
                    <span className="text-[10px] text-zinc-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Free Rent</span>
                    <span className="text-[10px] text-zinc-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />TI</span>
                    <span className="text-[10px] text-zinc-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Commission</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-500 italic">Enter lease area and term to see results.</p>
          )}
        </div>
      </div>
    </div>
  );
}
