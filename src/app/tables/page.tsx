"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Column } from "@/components/DataTable";
import { fmtCurrencyFull } from "@/lib/format";

type TableName = "companies" | "people" | "properties" | "transactions" | "permits";

const TABLE_CONFIG: Record<TableName, { label: string; icon: string }> = {
  companies: { label: "Companies", icon: "🏢" },
  people: { label: "People", icon: "👤" },
  properties: { label: "Properties", icon: "🏠" },
  transactions: { label: "Transactions", icon: "💰" },
  permits: { label: "Permits", icon: "🔨" },
};

function getColumns(table: TableName): Column<Record<string, unknown>>[] {
  switch (table) {
    case "companies":
      return [
        { key: "name", label: "Name" },
        { key: "entityNumber", label: "Entity #" },
        { key: "type", label: "Type", filterable: true },
        { key: "status", label: "Status", filterable: true, render: (r) => {
          const s = r.status as string;
          const color = s === "Active" ? "text-success" : s === "Dissolved" ? "text-danger" : "text-muted";
          return <span className={color}>{s || "—"}</span>;
        }},
        { key: "jurisdiction", label: "Jurisdiction" },
        { key: "registrationDate", label: "Reg. Date" },
        { key: "registeredAgent", label: "Agent", hidden: true },
        { key: "registeredAddress", label: "Address", hidden: true },
      ];
    case "people":
      return [
        { key: "fullName", label: "Name" },
        { key: "firstName", label: "First", hidden: true },
        { key: "lastName", label: "Last", hidden: true },
        { key: "address", label: "Address" },
      ];
    case "properties":
      return [
        { key: "address", label: "Address" },
        { key: "propertyType", label: "Type", filterable: true },
        { key: "neighbourhood", label: "Neighbourhood" },
        { key: "city", label: "City" },
        { key: "province", label: "Province", hidden: true },
        { key: "parcelId", label: "Parcel ID", hidden: true },
      ];
    case "transactions":
      return [
        { key: "transferDate", label: "Date" },
        { key: "transactionType", label: "Type" },
        { key: "grantor", label: "Grantor" },
        { key: "grantee", label: "Grantee" },
        { key: "price", label: "Price", render: (r) => <span className="font-mono">{fmtCurrencyFull(r.price)}</span>, getValue: (r) => r.price as number },
        { key: "titleNumber", label: "Title #", hidden: true },
      ];
    case "permits":
      return [
        { key: "permitNumber", label: "Permit #" },
        { key: "issueDate", label: "Date" },
        { key: "applicant", label: "Applicant" },
        { key: "address", label: "Address" },
        { key: "workType", label: "Work Type", filterable: true },
        { key: "description", label: "Description", render: (r) => <span className="max-w-xs truncate block">{(r.description as string) || "—"}</span> },
        { key: "estimatedValue", label: "Value", render: (r) => <span className="font-mono">{fmtCurrencyFull(r.estimatedValue)}</span>, getValue: (r) => r.estimatedValue as number },
        { key: "status", label: "Status", hidden: true },
        { key: "buildingType", label: "Building Type", hidden: true },
      ];
  }
}

export default function TablesPage() {
  const router = useRouter();
  const [activeTable, setActiveTable] = useState<TableName>("companies");
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/tables?table=${activeTable}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, [activeTable]);

  const columns = useMemo(() => getColumns(activeTable), [activeTable]);

  const handleRowClick = (row: Record<string, unknown>) => {
    const id = row.id;
    if (!id) return;
    switch (activeTable) {
      case "companies": router.push(`/companies/${id}`); break;
      case "people": router.push(`/people/${id}`); break;
      case "properties": router.push(`/properties/${id}`); break;
      case "transactions": if (row.propertyId) router.push(`/properties/${row.propertyId}`); break;
      case "permits": if (row.propertyId) router.push(`/properties/${row.propertyId}`); break;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Tables</h1>
        <p className="text-muted text-sm mt-1">Browse, sort, filter, and export all data</p>
      </div>

      {/* Table selector */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(TABLE_CONFIG) as [TableName, { label: string; icon: string }][]).map(([key, { label, icon }]) => (
          <button
            key={key}
            onClick={() => setActiveTable(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTable === key
                ? "bg-accent/15 text-accent"
                : "text-muted hover:text-foreground hover:bg-white/5"
            }`}
          >
            <span>{icon}</span> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-muted p-8 text-center">Loading...</div>
      ) : (
        <DataTable
          data={data}
          columns={columns}
          pageSize={40}
          exportFilename={`cre-intel-${activeTable}`}
          onRowClick={handleRowClick}
        />
      )}
    </div>
  );
}
