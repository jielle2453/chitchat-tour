import "server-only";
import type { z } from "zod";
import { allowRequest } from "./guard";

function err(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

// Shared POST handler: rate guard, JSON + zod validation, error mapping.
export async function handlePost<S extends z.ZodType, R>(request: Request, schema: S, run: (input: z.infer<S>) => Promise<R>): Promise<Response> {
  if (!allowRequest()) return err("Daily request limit reached. Try again tomorrow.", 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err("Body must be valid JSON.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return err(`Invalid request: ${first?.path.join(".") || "body"} ${first?.message ?? ""}`.trim(), 400);
  }
  try {
    return Response.json(await run(parsed.data));
  } catch (e) {
    console.error("agent route failed", e);
    return err("The guide could not answer right now.", 500);
  }
}
