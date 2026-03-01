import { NextRequest, NextResponse } from "next/server";

// Simplified middleware for Edge Runtime compatibility
// Kill switch protection is implemented at the API route level
// since we can't use Node.js fs modules in Edge Runtime

export async function middleware(request: NextRequest) {
  // Continue with normal request processing
  // Individual API routes will check for kill switch status
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}