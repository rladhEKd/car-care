import { handleAi } from "@/lib/ai/service";
export const maxDuration = 30;
export async function POST(request: Request) { return handleAi(request, "briefing"); }
