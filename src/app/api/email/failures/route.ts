import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(req.url);
    const since = url.searchParams.get('since'); // ISO date string
    const tag = url.searchParams.get('tag'); // Filter by tag
    const limit = parseInt(url.searchParams.get('limit') || '50');

    const failuresPath = path.join(process.cwd(), "data", "email-failures.json");
    
    if (!fs.existsSync(failuresPath)) {
      return NextResponse.json({ failures: [], count: 0 });
    }

    const failuresData = fs.readFileSync(failuresPath, 'utf-8');
    let failures = JSON.parse(failuresData);

    // Filter by date if specified
    if (since) {
      const sinceDate = new Date(since);
      failures = failures.filter((f: any) => new Date(f.timestamp) >= sinceDate);
    }

    // Filter by tag if specified  
    if (tag) {
      failures = failures.filter((f: any) => f.tag === tag);
    }

    // Apply limit
    failures = failures.slice(-limit);

    return NextResponse.json({
      failures: failures.reverse(), // Most recent first
      count: failures.length
    });

  } catch (error) {
    console.error("Failed to fetch email failures:", error);
    return NextResponse.json({ error: "Failed to fetch failures" }, { status: 500 });
  }
}

// DELETE endpoint to clear old failures (for maintenance)
export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(req.url);
    const olderThan = url.searchParams.get('olderThan'); // ISO date string

    if (!olderThan) {
      return NextResponse.json({ error: "olderThan parameter required" }, { status: 400 });
    }

    const failuresPath = path.join(process.cwd(), "data", "email-failures.json");
    
    if (!fs.existsSync(failuresPath)) {
      return NextResponse.json({ message: "No failures file exists", deleted: 0 });
    }

    const failuresData = fs.readFileSync(failuresPath, 'utf-8');
    const allFailures = JSON.parse(failuresData);
    
    const cutoffDate = new Date(olderThan);
    const remainingFailures = allFailures.filter((f: any) => new Date(f.timestamp) >= cutoffDate);
    
    const deletedCount = allFailures.length - remainingFailures.length;
    
    fs.writeFileSync(failuresPath, JSON.stringify(remainingFailures, null, 2));

    return NextResponse.json({
      message: `Deleted ${deletedCount} old failure records`,
      deleted: deletedCount,
      remaining: remainingFailures.length
    });

  } catch (error) {
    console.error("Failed to clean email failures:", error);
    return NextResponse.json({ error: "Failed to clean failures" }, { status: 500 });
  }
}