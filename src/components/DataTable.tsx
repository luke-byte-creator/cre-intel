"use client";

import { useState, useMemo, useCallback } from "react";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  getValue?: (row: T) => string | number | null;
  hidden?: boolean;
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
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(columns.filter((c) => !c.hidden).map((c) => c.key))
  );
  const [showColMenu, setShowColMenu] = useState(false);

  const filtered = useMemo(() => {
    if (!filter) return data;
    const q = filter.toLowerCase();
    if (filterFn) return data.filter((row) => filterFn(row, q));
    return data.filter((row) =>
      columns.some((col) => {
        const val = col.getValue ? col.getValue(row) : (row as Record<string, unknown>)[col.key];
        return val != null && String(val).toLowerCase().includes(q);
      })
    );
  }, [data, filter, filterFn, columns]);

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

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Filter..."
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
          className="bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent flex-1 min-w-[200px]"
        />
        <div className="relative">
          <button
            onClick={() => setShowColMenu(!showColMenu)}
            className="bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-muted hover:text-foreground"
          >
            Columns ▾
          </button>
          {showColMenu && (
            <div className="absolute right-0 top-full mt-1 bg-card border border-card-border rounded-lg shadow-lg z-20 p-2 min-w-[180px]">
              {columns.map((col) => (
                <label key={col.key} className="flex items-center gap-2 px-2 py-1 text-sm text-foreground cursor-pointer hover:bg-white/5 rounded">
                  <input
                    type="checkbox"
                    checked={visibleCols.has(col.key)}
                    onChange={(e) => {
                      const next = new Set(visibleCols);
                      e.target.checked ? next.add(col.key) : next.delete(col.key);
                      setVisibleCols(next);
                    }}
                    className="accent-accent"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={exportCSV}
          className="bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-muted hover:text-foreground"
        >
          Export CSV
        </button>
        <span className="text-xs text-muted ml-auto">
          {sorted.length} result{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-card-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-card border-b border-card-border">
              {activeCols.map((col) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  className={`px-4 py-3 text-left font-medium text-muted whitespace-nowrap ${
                    col.sortable !== false ? "cursor-pointer hover:text-foreground select-none" : ""
                  }`}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1 text-accent">{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={activeCols.length} className="px-4 py-8 text-center text-muted">
                  No results
                </td>
              </tr>
            ) : (
              paged.map((row, i) => (
                <tr
                  key={i}
                  onClick={() => onRowClick?.(row)}
                  className={`border-b border-card-border last:border-0 ${
                    onRowClick ? "cursor-pointer hover:bg-white/5" : ""
                  } ${i % 2 === 0 ? "bg-background" : "bg-card/50"}`}
                >
                  {activeCols.map((col) => (
                    <td key={col.key} className="px-4 py-2.5 whitespace-nowrap">
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
            className="px-3 py-1.5 rounded-lg bg-card border border-card-border text-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="text-muted">
            Page {currentPage + 1} of {totalPages}
          </span>
          <button
            disabled={currentPage >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded-lg bg-card border border-card-border text-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
