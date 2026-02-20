import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Helper function to get user from session/auth
async function getCurrentUser(req: NextRequest) {
  // TODO: Replace with your actual auth system
  // For now, assuming you have some way to get the current user
  // This should integrate with your existing auth middleware
  
  // Placeholder - in a real system, extract from session/JWT/cookie
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return null;
  
  // For now, just check if it's Luke (you'll need to adapt this to your auth system)
  try {
    const users = await db.select().from(schema.users)
      .where(eq(schema.users.email, "luke.jansen@cbre.com"))
      .limit(1);
    
    if (users[0] && users[0].role === 'admin') {
      return users[0];
    }
  } catch (e) {
    console.error("Error getting current user:", e);
  }
  
  return null;
}

function getClientIP(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const realIP = req.headers.get("x-real-ip");
  
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  if (realIP) {
    return realIP;
  }
  return "unknown";
}

function getKillswitchPath(): string {
  return path.join(process.cwd(), "data", "killswitch.lock");
}

function getKillswitchLogPath(): string {
  return path.join(process.cwd(), "data", "killswitch.log");
}

function logKillswitchEvent(event: string, user: any, ip: string, details?: string) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event,
      user: user ? { id: user.id, email: user.email } : null,
      ip,
      details: details || null
    };
    
    const logPath = getKillswitchLogPath();
    const logDir = path.dirname(logPath);
    
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
    console.log(`KILLSWITCH ${event.toUpperCase()}:`, logEntry);
  } catch (error) {
    console.error("Failed to log killswitch event:", error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, confirmation } = await req.json();
    const clientIP = getClientIP(req);
    
    // Check authentication - only admin users can use killswitch
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized - admin access required" }, { status: 401 });
    }
    
    const killswitchPath = getKillswitchPath();
    const killswitchActive = fs.existsSync(killswitchPath);
    
    if (action === "activate") {
      // Activate kill switch
      if (confirmation !== "SHUTDOWN") {
        return NextResponse.json({ 
          error: "Invalid confirmation", 
          message: "Type SHUTDOWN to confirm emergency shutdown" 
        }, { status: 400 });
      }
      
      if (killswitchActive) {
        return NextResponse.json({ 
          error: "Kill switch already active",
          message: "System is already in emergency shutdown mode"
        }, { status: 400 });
      }
      
      // Create the lock file
      const dataDir = path.dirname(killswitchPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      fs.writeFileSync(killswitchPath, JSON.stringify({
        activatedAt: new Date().toISOString(),
        activatedBy: currentUser.id,
        activatedByEmail: currentUser.email,
        activatedFromIP: clientIP,
        reason: "Manual emergency shutdown via admin interface"
      }, null, 2));
      
      // Log the event
      logKillswitchEvent("ACTIVATED", currentUser, clientIP, "Manual shutdown via admin UI");
      
      // Attempt to kill Cloudflare tunnel
      try {
        await execAsync("pkill -f cloudflared");
        console.log("Cloudflare tunnel process killed");
      } catch (error) {
        console.warn("Failed to kill cloudflared process (may not be running):", error);
      }
      
      return NextResponse.json({ 
        success: true,
        message: "Emergency shutdown activated - Nova Research is now offline",
        activatedAt: new Date().toISOString()
      });
      
    } else if (action === "deactivate") {
      // Deactivate kill switch
      if (confirmation !== "RESTORE") {
        return NextResponse.json({ 
          error: "Invalid confirmation", 
          message: "Type RESTORE to confirm system restoration" 
        }, { status: 400 });
      }
      
      if (!killswitchActive) {
        return NextResponse.json({ 
          error: "Kill switch not active",
          message: "System is not currently in emergency shutdown mode"
        }, { status: 400 });
      }
      
      // Remove the lock file
      fs.unlinkSync(killswitchPath);
      
      // Log the event
      logKillswitchEvent("DEACTIVATED", currentUser, clientIP, "System restored via admin UI");
      
      return NextResponse.json({ 
        success: true,
        message: "System restored - Nova Research is now online",
        restoredAt: new Date().toISOString()
      });
      
    } else if (action === "status") {
      // Check kill switch status
      if (killswitchActive) {
        let lockInfo = null;
        try {
          const lockContent = fs.readFileSync(killswitchPath, 'utf-8');
          lockInfo = JSON.parse(lockContent);
        } catch (e) {
          lockInfo = { error: "Failed to read lock file details" };
        }
        
        return NextResponse.json({
          active: true,
          message: "Emergency shutdown is ACTIVE - system offline",
          lockInfo
        });
      } else {
        return NextResponse.json({
          active: false,
          message: "System is operating normally"
        });
      }
      
    } else {
      return NextResponse.json({ 
        error: "Invalid action", 
        message: "Action must be 'activate', 'deactivate', or 'status'" 
      }, { status: 400 });
    }
    
  } catch (error) {
    console.error("Kill switch API error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const killswitchPath = getKillswitchPath();
    const killswitchActive = fs.existsSync(killswitchPath);
    
    if (killswitchActive) {
      let lockInfo = null;
      try {
        const lockContent = fs.readFileSync(killswitchPath, 'utf-8');
        lockInfo = JSON.parse(lockContent);
      } catch (e) {
        lockInfo = { error: "Failed to read lock file details" };
      }
      
      return NextResponse.json({
        active: true,
        message: "Emergency shutdown is ACTIVE",
        lockInfo
      });
    } else {
      return NextResponse.json({
        active: false,
        message: "System operating normally"
      });
    }
    
  } catch (error) {
    console.error("Kill switch status check error:", error);
    return NextResponse.json({ 
      error: "Internal server error" 
    }, { status: 500 });
  }
}