import { getEnv } from "@/lib/env";
import { handleAuth } from "@/lib/auth/handler";
export async function GET(request: Request) {
  return handleAuth(request, await getEnv(), "session");
}
