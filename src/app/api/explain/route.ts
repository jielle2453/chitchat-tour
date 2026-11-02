import { runExplain } from "@/lib/agent/ask";
import { handlePost } from "@/lib/agent/http";
import { explainSchema } from "@/lib/agent/schemas";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handlePost(request, explainSchema, runExplain);
}
