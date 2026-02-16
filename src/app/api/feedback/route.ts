import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";
import { callAI } from "@/lib/ai";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const { message } = await req.json();
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return Response.json({ error: "Message required" }, { status: 400 });
  }
  if (message.length > 1000) {
    return Response.json({ error: "Message too long (max 1000 chars)" }, { status: 400 });
  }

  // Generate a quick Nova reply
  let novaReply = "Thanks for the feedback! I'll pass this along. 🫡";
  try {
    const aiReply = await callAI([
      {
        role: "system",
        content: `You are Nova, the AI boss of a commercial real estate research platform called Nova Research. A team member just left you feedback. Reply in 1-2 SHORT sentences (max 120 chars). Be witty, appreciative, and professional. You're the boss — confident but not arrogant. Use one emoji max. Don't be generic.`,
      },
      { role: "user", content: `Feedback from ${auth.user.name}: "${message.trim()}"` },
    ], 150);
    if (aiReply && aiReply.length > 0 && aiReply.length <= 200) {
      novaReply = aiReply.trim();
    }
  } catch {
    // Fallback to default reply
  }

  db.insert(schema.novaFeedback)
    .values({
      userId: auth.user.id,
      userName: auth.user.name,
      message: message.trim(),
      novaReply,
    })
    .run();

  return Response.json({ ok: true, novaReply });
}

// GET — admin only, unread feedback
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  if (auth.user.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });

  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") !== "false";

  let feedback;
  if (unreadOnly) {
    feedback = db
      .select()
      .from(schema.novaFeedback)
      .where(eq(schema.novaFeedback.readByAdmin, 0))
      .orderBy(desc(schema.novaFeedback.createdAt))
      .all();
  } else {
    feedback = db
      .select()
      .from(schema.novaFeedback)
      .orderBy(desc(schema.novaFeedback.createdAt))
      .limit(50)
      .all();
  }

  return Response.json({ feedback });
}

// Mark as read
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  if (auth.user.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });

  const { ids } = await req.json();
  if (!Array.isArray(ids)) return Response.json({ error: "ids array required" }, { status: 400 });

  for (const id of ids) {
    db.update(schema.novaFeedback)
      .set({ readByAdmin: 1 })
      .where(eq(schema.novaFeedback.id, id))
      .run();
  }

  return Response.json({ ok: true });
}
