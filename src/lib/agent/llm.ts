import "server-only";
import { metaClient, MODELS } from "@/lib/meta/client";
import { extractOutputText, type ResponsesResult } from "@/lib/verify";
import { REQUEST_TIMEOUT_MS, timeoutSignal } from "./guard";

// Thin wrapper over the Responses API so SDK typing differences never leak out.
type Create = (params: unknown, options?: unknown) => Promise<ResponsesResult>;

export async function responsesCreate(params: Record<string, unknown>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<ResponsesResult> {
  const responses = metaClient().responses as unknown as { create: Create };
  return responses.create({ model: MODELS.text, reasoning: { effort: "low" }, ...params }, { signal: timeoutSignal(timeoutMs) });
}

export async function responsesText(params: Record<string, unknown>, timeoutMs?: number): Promise<{ text: string; raw: ResponsesResult }> {
  const raw = await responsesCreate(params, timeoutMs);
  return { text: extractOutputText(raw), raw };
}

export interface ChatBackend {
  client: { chat: { completions: { create: (p: unknown, o?: unknown) => Promise<unknown> } } };
  model: string;
}

export async function chatText(oc: ChatBackend, system: string, user: string): Promise<string> {
  const res = (await oc.client.chat.completions.create(
    {
      model: oc.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 1500,
    },
    { signal: timeoutSignal() },
  )) as { choices?: { message?: { content?: string | null } }[] };
  return res.choices?.[0]?.message?.content ?? "";
}
