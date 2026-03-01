"use client";

import { useState, useMemo, useCallback } from "react";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  getValue?: (row: T) => string | number | null;
  hidden?: boolean;
  filterable?: boolean; // enables dropdown filter for this column
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  pageSize?: number;
  exportFilename?: string;
  filterFn?: (row: T, query: string) => boolean;
  onRowClick?: (row: T) => void;
}

export default function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  pageSize = 40,
  exportFilename = "export",
  filterFn,
  onRowClick,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(columns.filter((c) => !c.hidden).map((c) => c.key))
  );
  const [showColMenu, setShowColMenu] = useState(false);

  // Get unique values for filterable columns
  const filterOptions = useMemo(() => {
    const opts: Record<string, string[]> = {};
    columns.filter(c => c.filterable && visibleCols.has(c.key)).forEach(col => {
      const values = new Set<string>();
      data.forEach(row => {
        const val = col.getValue ? col.getValue(row) : (row as Record<string, unknown>)[col.key];
        if (val != null && String(val).trim()) values.add(String(val));
      });
      opts[col.key] = Array.from(values).sort();
    });
    return opts;
  }, [data, columns, visibleCols]);

  const filtered = useMemo(() => {
    let result = data;
    
    // Text filter
    if (filter) {
      const q = filter.toLowerCase();
      if (filterFn) {
        result = result.filter((row) => filterFn(row, q));
      } else {
        result = result.filter((row) =>
          columns.some((col) => {
            const val = col.getValue ? col.getValue(row) : (row as Record<string, unknown>)[col.key];
            return val != null && String(val).toLowerCase().includes(q);
          })
        );
      }
    }
    
    // Column filters
    for (const [key, value] of Object.entries(columnFilters)) {
      if (!value) continue;
      const col = columns.find(c => c.key === key);
      result = result.filter(row => {
        const val = col?.getValue ? col.getValue(row) : (row as Record<string, unknown>)[key];
        return val != null && String(val) === value;
      });
    }
    
    return result;
  }, [data, filter, columnFilters, filterFn, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    return [...filtered].sort((a, b) => {
      const av = col?.getValue ? col.getValue(a) : (a as Record<string, unknown>)[sortKey];
      const bv = col?.getValue ? col.getValue(b) : (b as Record<string, unknown>)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const paged = sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const activeCols = columns.filter((c) => visibleCols.has(c.key));

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
      setPage(0);
    },
    [sortKey]
  );

  const exportCSV = useCallback(() => {
    const header = activeCols.map((c) => c.label).join(",");
    const rows = sorted.map((row) =>
      activeCols
        .map((col) => {
          const val = col.getValue ? col.getValue(row) : (row as Record<string, unknown>)[col.key];
          const s = val == null ? "" : String(val);
          return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    );
    const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportFilename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeCols, sorted, exportFilename]);

  const activeFilterCount = Object.values(columnFilters).filter(Boolean).length;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
            className="w-full bg-background border border-card-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
          />
        </div>

        {/* Column filter dropdowns */}
        {Object.entries(filterOptions).map(([key, options]) => {
          const col = columns.find(c => c.key === key);
          return (
            <select
              key={key}
              value={columnFilters[key] || ""}
              onChange={(e) => {
                setColumnFilters(prev => ({ ...prev, [key]: e.target.value }));
                setPage(0);
              }}
              className="bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-foreground appearance-none cursor-pointer hover:border-muted focus:outline-none focus:ring-1 focus:ring-accent pr-8"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2371717a' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10l-5 5z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
            >
              <option value="">All {col?.label || key}</option>
              {options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          );
        })}

        <div className="relative">
          <button
            onClick={() => setShowColMenu(!showColMenu)}
            className="bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-muted hover:text-foreground hover:border-muted flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            Columns
          </button>
          {showColMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowColMenu(false)} />
              <div className="absolute right-0 top-full mt-1 bg-card border border-card-border rounded-lg shadow-xl z-20 p-2 min-w-[180px]">
                {columns.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 text-sm text-foreground cursor-pointer hover:bg-white/5 rounded">
                    <input
                      type="checkbox"
                      checked={visibleCols.has(col.key)}
                      onChange={(e) => {
                        const next = new Set(visibleCols);
                        e.target.checked ? next.add(col.key) : next.delete(col.key);
                        setVisibleCols(next);
                      }}
                      className="accent-accent rounded"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <button
          onClick={exportCSV}
          className="bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-muted hover:text-foreground hover:border-muted flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          CSV
        </button>
        <span className="text-xs text-muted ml-auto tabular-nums">
          {sorted.length} result{sorted.length !== 1 ? "s" : ""}
          {activeFilterCount > 0 && <span className="text-accent ml-1">({activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""})</span>}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-card-border max-h-[70vh] overflow-y-auto sticky-header">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-card-border">
              {activeCols.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  className={`px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted whitespace-nowrap ${
                    col.sortable !== false ? "cursor-pointer hover:text-foreground select-none" : ""
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (
                      <span className="text-accent">{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={activeCols.length} className="px-4 py-12 text-center text-muted">
                  <svg className="w-8 h-8 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                  No results found
                </td>
              </tr>
            ) : (
              paged.map((row, i) => (
                <tr
                  key={i}
                  onClick={() => onRowClick?.(row)}
                  className={`border-b border-card-border/50 last:border-0 ${
                    onRowClick ? "cursor-pointer" : ""
                  } ${i % 2 === 0 ? "bg-background" : "bg-card/30"} hover:bg-accent/[0.04]`}
                >
                  {activeCols.map((col) => (
                    <td key={col.key} className="px-4 py-2.5 whitespace-nowrap text-sm">
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            disabled={currentPage === 0}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded-lg bg-card border border-card-border text-muted hover:text-foreground hover:border-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            Prev
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 5) p = i;
              else if (currentPage < 3) p = i;
              else if (currentPage > totalPages - 4) p = totalPages - 5 + i;
              else p = currentPage - 2 + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium ${
                    p === currentPage ? "bg-accent text-white" : "text-muted hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  {p + 1}
                </button>
              );
            })}
          </div>
          <button
            disabled={currentPage >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg bg-card border border-card-border text-muted hover:text-foreground hover:border-muted disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            Next
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
