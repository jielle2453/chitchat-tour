import { handlePost } from "@/lib/agent/http";
import { discoverSchema } from "@/lib/agent/schemas";
import { runDiscover } from "@/lib/agent/discover";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handlePost(request, discoverSchema, runDiscover);
}
