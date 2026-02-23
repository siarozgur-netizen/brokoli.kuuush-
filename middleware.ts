import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run middleware only on application routes, not on Next internals or static files.
    "/((?!_next|favicon.ico|.*\\..*).*)"
  ]
};
