import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getAccessLevel } from "@/lib/credit-service";

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({
    user: {
      ...user,
      accessLevel: getAccessLevel(user.creditBalance),
    },
  });
}
