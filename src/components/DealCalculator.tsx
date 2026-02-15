"use client";

import { useState, useMemo, useEffect } from "react";

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function InputField({ label, value, onChange, suffix, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; suffix?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-zinc-400 block mb-1">{label}</label>
      <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden focus-within:border-zinc-500 transition">
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || "0"}
          className="flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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

export interface RentStep {
  month: string; // month number when step kicks in
  rent: string;  // new $/SF/yr rate
}

export interface DealEconomicsData {
  inputs: {
    sf: string;
    baseRent: string;
    term: string;
    freeRent: string;
    ti: string;
    commRate: string;
    otherExpense: string;
    rentSteps: RentStep[];
  };
  results: {
    totalRent: number;
    totalConcessions: number;
    nerYear: number;
    nerMonth: number;
    commission: number;
    landlordNet: number;
    otherExpenseTotal: number;
  };
  savedAt: string;
}

interface DealCalculatorProps {
  initialData?: DealEconomicsData | null;
  onSave?: (data: DealEconomicsData) => void;
  onRemove?: () => void;
  compact?: boolean; // when used in modal, slightly tighter
}

export default function DealCalculator({ initialData, onSave, onRemove, compact }: DealCalculatorProps = {}) {
  const [sf, setSf] = useState(initialData?.inputs.sf || "5000");
  const [baseRent, setBaseRent] = useState(initialData?.inputs.baseRent || "20");
  const [term, setTerm] = useState(initialData?.inputs.term || "60");
  const [freeRent, setFreeRent] = useState(initialData?.inputs.freeRent || "3");
  const [ti, setTi] = useState(initialData?.inputs.ti || "15");
  const [commRate, setCommRate] = useState(initialData?.inputs.commRate || "5");
  const [otherExpense, setOtherExpense] = useState(initialData?.inputs.otherExpense || "0");
  const [rentSteps, setRentSteps] = useState<RentStep[]>(initialData?.inputs.rentSteps || []);

  // Sync if initialData changes (e.g. opening modal for different deal)
  useEffect(() => {
    if (initialData) {
      setSf(initialData.inputs.sf);
      setBaseRent(initialData.inputs.baseRent);
      setTerm(initialData.inputs.term);
      setFreeRent(initialData.inputs.freeRent);
      setTi(initialData.inputs.ti);
      setCommRate(initialData.inputs.commRate);
      setOtherExpense(initialData.inputs.otherExpense || "0");
      setRentSteps(initialData.inputs.rentSteps || []);
    }
  }, [initialData]);

  const addStep = () => {
    setRentSteps([...rentSteps, { month: "", rent: "" }]);
  };

  const updateStep = (idx: number, field: keyof RentStep, value: string) => {
    const updated = [...rentSteps];
    updated[idx] = { ...updated[idx], [field]: value };
    setRentSteps(updated);
  };

  const removeStep = (idx: number) => {
    setRentSteps(rentSteps.filter((_, i) => i !== idx));
  };

  const calc = useMemo(() => {
    const s = parseFloat(sf) || 0;
    const br = parseFloat(baseRent) || 0;
    const t = parseFloat(term) || 0;
    const fr = parseFloat(freeRent) || 0;
    const tiVal = parseFloat(ti) || 0;
    const cr = (parseFloat(commRate) || 0) / 100;
    const otherExp = parseFloat(otherExpense) || 0;

    if (s === 0 || t === 0) return null;

    // Build sorted rent schedule: [{month, rate}]
    const steps = rentSteps
      .filter(st => st.month && st.rent)
      .map(st => ({ month: parseInt(st.month), rate: parseFloat(st.rent) }))
      .filter(st => !isNaN(st.month) && !isNaN(st.rate))
      .sort((a, b) => a.month - b.month);

    // Get effective rent rate at a given month
    const getRateAtMonth = (m: number): number => {
      let rate = br;
      for (const step of steps) {
        if (m >= step.month - 1) { // step.month is 1-indexed (month 36 = start of month 36)
          rate = step.rate;
        } else break;
      }
      return rate;
    };

    // Month-by-month calculation
    let totalRent = 0;
    for (let m = 0; m < t; m++) {
      if (m < fr) continue; // free rent period
      const monthlyRent = getRateAtMonth(m) * s / 12;
      totalRent += monthlyRent;
    }

    const tiCost = tiVal * s;
    const freeRentValue = br * s * fr / 12;
    const totalConcessions = freeRentValue + tiCost;
    const termYears = t / 12;
    const nerYear = (totalRent - tiCost - otherExp) / termYears / s;
    const nerMonth = nerYear / 12;
    const commission = cr * totalRent;
    const landlordNet = totalRent - totalConcessions - commission - otherExp;
    const concessionPct = totalRent > 0 ? (totalConcessions / totalRent) * 100 : 0;

    const netCollected = totalRent - freeRentValue;
    const barTotal = netCollected + freeRentValue + tiCost + commission + otherExp;

    return {
      totalRent, totalConcessions, nerYear, nerMonth, commission, landlordNet, concessionPct,
      freeRentValue, tiCost, otherExpenseTotal: otherExp,
      bar: barTotal > 0 ? {
        rent: (netCollected / barTotal) * 100,
        free: (freeRentValue / barTotal) * 100,
        ti: (tiCost / barTotal) * 100,
        comm: (commission / barTotal) * 100,
        other: (otherExp / barTotal) * 100,
      } : null,
    };
  }, [sf, baseRent, term, freeRent, ti, commRate, otherExpense, rentSteps]);

  const handleSave = () => {
    if (!calc || !onSave) return;
    onSave({
      inputs: { sf, baseRent, term, freeRent, ti, commRate, otherExpense, rentSteps },
      results: {
        totalRent: calc.totalRent,
        totalConcessions: calc.totalConcessions,
        nerYear: calc.nerYear,
        nerMonth: calc.nerMonth,
        commission: calc.commission,
        landlordNet: calc.landlordNet,
        otherExpenseTotal: calc.otherExpenseTotal,
      },
      savedAt: new Date().toISOString(),
    });
  };

  return (
    <div className={compact ? "" : "bg-zinc-800/50 border border-zinc-700 rounded-xl p-5"}>
      {!compact && <h3 className="text-base font-semibold text-white mb-4">Deal Economics Calculator</h3>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="space-y-3">
          <InputField label="Lease Area" value={sf} onChange={setSf} suffix="SF" />
          <InputField label="Base Rent" value={baseRent} onChange={setBaseRent} suffix="$/SF/yr" />

          {/* Rent Steps — right after base rent */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-zinc-400">Rent Steps</label>
              <button onClick={addStep} className="text-[10px] text-blue-400 hover:text-blue-300">+ Add Step</button>
            </div>
            {rentSteps.length === 0 && (
              <p className="text-[10px] text-zinc-600 italic">No steps — base rent applies for full term</p>
            )}
            {rentSteps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-1.5">
                <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden flex-1">
                  <span className="text-[10px] text-zinc-500 pl-2">Mo</span>
                  <input
                    type="number"
                    value={step.month}
                    onChange={e => updateStep(idx, "month", e.target.value)}
                    placeholder="36"
                    className="w-16 bg-transparent px-2 py-1.5 text-sm text-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <span className="text-zinc-600 text-xs">→</span>
                <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden flex-1">
                  <span className="text-[10px] text-zinc-500 pl-2">$</span>
                  <input
                    type="number"
                    value={step.rent}
                    onChange={e => updateStep(idx, "rent", e.target.value)}
                    placeholder="22"
                    className="w-16 bg-transparent px-2 py-1.5 text-sm text-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-[10px] text-zinc-500 pr-2">/SF/yr</span>
                </div>
                <button onClick={() => removeStep(idx)} className="text-zinc-600 hover:text-red-400 text-xs px-1">✕</button>
              </div>
            ))}
          </div>

          <InputField label="Lease Term" value={term} onChange={setTerm} suffix="months" />
          <InputField label="Free Rent" value={freeRent} onChange={setFreeRent} suffix="months" />
          <InputField label="TI Allowance" value={ti} onChange={setTi} suffix="$/SF" />
          <InputField label="Commission Rate" value={commRate} onChange={setCommRate} suffix="%" />
          <InputField label="Other Expense" value={otherExpense} onChange={setOtherExpense} suffix="$" placeholder="0" />
        </div>

        {/* Outputs */}
        <div>
          {calc ? (
            <div className="space-y-1">
              <OutputRow label="Total Lease Value" value={`$${fmt(calc.totalRent)}`} color="text-emerald-400" />
              <OutputRow label="Total Concessions" value={`$${fmt(calc.totalConcessions)}`} color="text-amber-400" />
              {calc.otherExpenseTotal > 0 && (
                <OutputRow label="Other Expense" value={`$${fmt(calc.otherExpenseTotal)}`} color="text-orange-400" />
              )}
              <OutputRow label="Net Effective Rent" value={`$${fmt(calc.nerYear)}/SF/yr`} color="text-white" />
              <OutputRow label="Net Effective Rent" value={`$${fmt(calc.nerMonth)}/SF/mo`} color="text-white" />
              <OutputRow label="Landlord Net Position" value={`$${fmt(calc.landlordNet)}`} color={calc.landlordNet >= 0 ? "text-emerald-400" : "text-red-400"} />
              <OutputRow label="Your Commission" value={`$${fmt(calc.commission)}`} color="text-emerald-400" />
              <OutputRow label="Concession as % of Lease" value={`${fmt(calc.concessionPct)}%`} color="text-amber-400" />

              {calc.bar && (
                <div className="pt-4">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Value Breakdown</p>
                  <div className="flex h-4 rounded-full overflow-hidden">
                    <div className="bg-emerald-500" style={{ width: `${calc.bar.rent}%` }} title="Rent Collected" />
                    <div className="bg-amber-500" style={{ width: `${calc.bar.free}%` }} title="Free Rent" />
                    <div className="bg-orange-500" style={{ width: `${calc.bar.ti}%` }} title="TI Allowance" />
                    <div className="bg-blue-500" style={{ width: `${calc.bar.comm}%` }} title="Commission" />
                    {calc.bar.other > 0 && <div className="bg-red-500" style={{ width: `${calc.bar.other}%` }} title="Other Expense" />}
                  </div>
                  <div className="flex gap-4 mt-2 flex-wrap">
                    <span className="text-[10px] text-zinc-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Rent</span>
                    <span className="text-[10px] text-zinc-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Free Rent</span>
                    <span className="text-[10px] text-zinc-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />TI</span>
                    <span className="text-[10px] text-zinc-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Commission</span>
                    {calc.bar.other > 0 && <span className="text-[10px] text-zinc-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Other</span>}
                  </div>
                </div>
              )}

              {/* Save/Remove buttons when linked to a deal */}
              {onSave && (
                <div className="flex gap-2 pt-4">
                  <button onClick={handleSave} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-500 transition">
                    Save to Deal
                  </button>
                  {onRemove && initialData && (
                    <button onClick={onRemove} className="px-4 py-2 bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium hover:bg-red-600 hover:text-white transition">
                      Remove
                    </button>
                  )}
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
