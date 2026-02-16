import { db, schema } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json();
    const { action, category, detail, path } = body;

    if (!action || !category) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    await db.insert(schema.activityEvents).values({
      userId: auth.user.id,
      userName: auth.user.name,
      action,
      category,
      detail: detail ? JSON.stringify(detail) : null,
      path: path || null,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
