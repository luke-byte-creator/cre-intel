import { NextRequest } from "next/server";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

// Agent-to-tool mapping: each agent activates when their tool is used by a human today
const AGENT_DEFS = [
  {
    id: "nova",
    name: "Nova",
    title: "The Boss",
    // Activates when ANY tool is used
    check: (events: ActivityRow[]) => events.length > 0,
  },
  {
    id: "atlas",
    name: "Atlas",
    title: "Document Architect",
    // Activates when document drafter is used
    check: (events: ActivityRow[]) => events.some(e =>
      e.category === "drafts" || (e.path && e.path.includes("/drafts"))
    ),
  },
  {
    id: "sage",
    name: "Sage",
    title: "Trade Record Keeper",
    // Activates when trade records or comps are worked on
    check: (events: ActivityRow[]) => events.some(e =>
      e.category === "comps" ||
      (e.path && (e.path.includes("/trade-records") || e.path.includes("/sales") || e.path.includes("/leases")))
    ),
  },
  {
    id: "pixl",
    name: "PIXL",
    title: "Chief Importer",
    // Activates when import tool is used
    check: (events: ActivityRow[]) => events.some(e =>
      (e.path && e.path.includes("/import")) || e.action === "create"
    ),
  },
  {
    id: "iris",
    name: "Iris",
    title: "Intel Director",
    // Activates when intel tools are used (search, find-comps, insights, permits, inventory)
    check: (events: ActivityRow[]) => events.some(e =>
      e.category === "search" ||
      e.category === "insights" ||
      (e.path && (e.path.includes("/search") || e.path.includes("/find-comps") || e.path.includes("/permits") || e.path.includes("/inventory")))
    ),
  },
  {
    id: "echo",
    name: "Echo",
    title: "Office Secretary",
    // Activates when inquiries are handled
    check: (events: ActivityRow[]) => events.some(e =>
      e.category === "inquiries" || (e.path && e.path.includes("/inquir"))
    ),
  },
  {
    id: "scout",
    name: "Scout",
    title: "Watchlist Sentinel",
    // Activates when watchlist is used
    check: (events: ActivityRow[]) => events.some(e =>
      e.category === "watchlist" || (e.path && e.path.includes("/watchlist"))
    ),
  },
];

interface ActivityRow {
  action: string;
  category: string;
  path: string | null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  // Get today's start in UTC
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  // Fetch all activity events from today (excluding page_view to focus on real actions)
  let events: ActivityRow[] = [];
  try {
    events = db.all(sql`
      SELECT action, category, path
      FROM activity_events
      WHERE created_at >= ${todayStart}
        AND action != 'page_view'
    `) as ActivityRow[];
  } catch {
    // Table might not exist yet
  }

  const agents = AGENT_DEFS.map(agent => ({
    id: agent.id,
    name: agent.name,
    title: agent.title,
    status: agent.check(events) ? "working" : "idle",
  }));

  return Response.json({ agents });
}
