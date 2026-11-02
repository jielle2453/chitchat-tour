import { runAsk } from "@/lib/agent/ask";
import { handlePost } from "@/lib/agent/http";
import { askSchema } from "@/lib/agent/schemas";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handlePost(request, askSchema, runAsk);
}
