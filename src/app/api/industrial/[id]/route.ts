import { NextRequest, NextResponse } from "next/server";
import { requireFullAccess } from "@/lib/auth";
import { awardCredits } from "@/lib/credit-service";
import fs from "fs";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "public", "data", "inventory.json");

interface Building {
  address: string;
  id: string | null;
  city: string;
  postalCode: string | null;
  areaSF: number | null;
  neighborhood: string | null;
  permitDate: string | null;
  addition: string | null;
  businessName: string | null;
  businessDesc: string | null;
  siteId: number | null;
  gradeSF: number | null;
  upperSF: number | null;
  citySF: number | null;
}

function readData(): Building[] {
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
}

function writeData(data: Building[]) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

// PATCH - update an industrial building by its id field
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const body = await req.json();

  const allowed = new Set([
    "businessName", "businessDesc", "areaSF", "neighborhood",
    "postalCode", "permitDate", "addition", "gradeSF", "upperSF", "citySF",
  ]);

  const data = readData();
  const idx = data.findIndex((b) => b.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  for (const [k, v] of Object.entries(body)) {
    if (allowed.has(k)) {
      if (["areaSF", "gradeSF", "upperSF", "citySF", "siteId"].includes(k)) {
        (data[idx] as unknown as Record<string, unknown>)[k] = v === "" || v === null ? null : Math.round(Number(v));
      } else {
        (data[idx] as unknown as Record<string, unknown>)[k] = v === "" ? null : v;
      }
    }
  }

  writeData(data);

  // Award 1 credit for industrial edit
  awardCredits(auth.user.id, 1, "update_industrial", undefined, undefined, `Updated ${data[idx].businessName || data[idx].address || "industrial building"}`);

  return NextResponse.json(data[idx]);
}
