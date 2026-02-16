import { NextRequest, NextResponse } from "next/server";
import { requireFullAccess } from "@/lib/auth";
import { awardCredits } from "@/lib/credit-service";
import fs from "fs";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "public", "data", "inventory.json");

// POST - add a new industrial building
export async function POST(req: NextRequest) {
  const auth = await requireFullAccess(req);
  if (auth instanceof Response) return auth;
  const body = await req.json();

  if (!body.address) return NextResponse.json({ error: "address required" }, { status: 400 });

  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));

  const newBuilding = {
    address: body.address,
    id: body.id || null,
    city: body.city || "Saskatoon",
    postalCode: body.postalCode || null,
    areaSF: body.areaSF ? Math.round(Number(body.areaSF)) : null,
    neighborhood: body.neighborhood || null,
    permitDate: body.permitDate || null,
    addition: `Added ${new Date().toISOString().slice(0, 10)}`,
    businessName: body.businessName || null,
    businessDesc: body.businessDesc || null,
    siteId: body.siteId ? Number(body.siteId) : null,
    gradeSF: body.gradeSF ? Math.round(Number(body.gradeSF)) : null,
    upperSF: body.upperSF ? Math.round(Number(body.upperSF)) : null,
    citySF: body.citySF ? Math.round(Number(body.citySF)) : null,
  };

  data.push(newBuilding);
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

  awardCredits(auth.user.id, 1, "update_industrial", undefined, undefined, `Added industrial building — ${body.address}`);

  return NextResponse.json(newBuilding);
}
