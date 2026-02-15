import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, schema } from "@/db";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json();

    if (!body.type || !body.address) {
      return Response.json({ error: "type and address are required" }, { status: 400 });
    }
    if (body.type !== "Sale" && body.type !== "Lease") {
      return Response.json({ error: "type must be 'Sale' or 'Lease'" }, { status: 400 });
    }

    const result = db.insert(schema.comps).values({
      type: body.type,
      propertyType: body.propertyType || null,
      address: body.address,
      city: body.city || "Saskatoon",
      province: body.province || "Saskatchewan",
      seller: body.seller || null,
      purchaser: body.purchaser || null,
      landlord: body.landlord || null,
      tenant: body.tenant || null,
      saleDate: body.saleDate || null,
      salePrice: body.salePrice ? Number(body.salePrice) : null,
      pricePSF: body.pricePSF ? Number(body.pricePSF) : null,
      pricePerAcre: body.pricePerAcre ? Number(body.pricePerAcre) : null,
      netRentPSF: body.netRentPSF ? Number(body.netRentPSF) : null,
      annualRent: body.annualRent ? Number(body.annualRent) : null,
      areaSF: body.areaSF ? Number(body.areaSF) : null,
      landAcres: body.landAcres ? Number(body.landAcres) : null,
      landSF: body.landSF ? Number(body.landSF) : null,
      capRate: body.capRate ? Number(body.capRate) : null,
      noi: body.noi ? Number(body.noi) : null,
      yearBuilt: body.yearBuilt ? Number(body.yearBuilt) : null,
      zoning: body.zoning || null,
      comments: body.comments || null,
      source: body.source || null,
      termMonths: body.termMonths ? Number(body.termMonths) : null,
      leaseStart: body.leaseStart || null,
      leaseExpiry: body.leaseExpiry || null,
    }).returning({ id: schema.comps.id }).get();

    return Response.json({ success: true, id: result.id });
  } catch (err) {
    return Response.json({ error: `Failed to add comp: ${(err as Error).message}` }, { status: 500 });
  }
}
