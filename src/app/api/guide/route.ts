import { runGuide } from "@/lib/agent/guide";
import { handlePost } from "@/lib/agent/http";
import { guideSchema } from "@/lib/agent/schemas";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handlePost(request, guideSchema, runGuide);
}
