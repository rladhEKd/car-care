import { aiConfiguration } from "@/lib/ai/service";
export async function GET(request: Request) {
  void request.url;
  return Response.json(aiConfiguration(), { headers: { "Cache-Control": "no-store" } });
}
