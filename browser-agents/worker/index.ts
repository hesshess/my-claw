import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";

export class BrowserAgent extends AIChatAgent<Env> {}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response(null, { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;