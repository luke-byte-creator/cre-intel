import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export function getKillswitchPath(): string {
  return path.join(process.cwd(), "data", "killswitch.lock");
}

export function isKillSwitchActive(): boolean {
  try {
    const killswitchPath = getKillswitchPath();
    return fs.existsSync(killswitchPath);
  } catch {
    return false;
  }
}

export function createKillSwitchResponse(): NextResponse {
  return NextResponse.json(
    { 
      error: "Service temporarily unavailable", 
      message: "Nova Research is offline for security review. Contact your administrator." 
    }, 
    { status: 503 }
  );
}

/**
 * Middleware function to check kill switch and return 503 if active
 * Use this in API routes that should be blocked during emergency shutdown
 */
export function checkKillSwitch(): NextResponse | null {
  if (isKillSwitchActive()) {
    return createKillSwitchResponse();
  }
  return null;
}