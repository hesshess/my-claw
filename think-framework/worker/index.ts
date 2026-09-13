import { Session, Think, type TurnContext } from "@cloudflare/think";
import { createExtensionTools } from "@cloudflare/think/tools/extensions";
import { callable, routeAgentRequest } from "agents";
import { R2SkillProvider } from "agents/experimental/memory/session";
import { type LanguageModel, type ToolSet } from "ai";
import { createWorkersAI } from "workers-ai-provider";

type State = {
  files: {
    path: string;
    type: "file" | "directory";
    size: number;
    updatedAt: number;
  }[];
};

export class CoachAgent extends Think<Env, State> {
  maxSteps = 6;

async beforeTurn(ctx: TurnContext) {

  if (!ctx.continuation) {
    const { success } = await this.env.RATE_LIMITER.limit({
      key: this.name,
    });

    if (!success) {
      throw new Error(
        "Too many requests. Please try again in a minute.",
      );
    }
  }

  return {
    maxOutputTokens: 1000,
  };
};
  extensionLoader = this.env.LOADER;
  initialState: State = {
    files: [],
  };
  async onStart() {
    await this.refreshFiles();
  }

  async onChatResponse() {
    await this.refreshFiles();
    await this.session.refreshSystemPrompt();
  }

  async refreshFiles() {
    const all = await this.workspace.glob("**/*");
    this.setState({
      files: all
        .filter((file) => file.path !== "/")
        .map((file) => ({
          type: file.type === "directory" ? "directory" : "file",
          path: file.path,
          size: file.size,
          updatedAt: file.updatedAt,
        })),
    });
  }

  getModel(): LanguageModel {
    const workersAI = createWorkersAI({ binding: this.env.AI });
    return workersAI("@cf/moonshotai/kimi-k2.5");
  }

  getTools(): ToolSet {
    const manager = this.extensionManager!;

    return {
      ...createExtensionTools({ manager }),
      ...manager.getTools(),
    };
  }

  @callable()
  async readWorkspaceFile(path: string) {
    return await this.workspace.readFile(path);
  }

  configureSession(session: Session) {
    return session
      .withContext("soul", {
        description: "The fitness coach's personality and behavior.",
        provider: {
          async get() {
            return `
          You are a personal fitness coach.

- Be encouraging, but do not accept excuses.
- Consider the user's injuries and physical limitations.
- Always ask how the training felt.
- End every conversation with the exercise the user should focus on tomorrow.
- Never recommend exercising through sharp pain.
`;
          },
        },
      })
      .withContext("memory", {
        description: `Persistent user fitness profile.

Store and maintain:
- body weight
- injuries and physical limitations
- fitness goals

Whenever the user provides or changes one of these facts,
use set_context with label "memory".
Keep a complete consolidated profile instead of losing older facts.`,
        maxTokens: 10_000,
      })
      .withContext("skills", {
        description: `
Exercise reference guides.

When a question matches an available guide:
1. Call load_context with label "skills".
2. Use the guide when preparing the answer.
3. Call unload_context with the same label and key.
4. Then provide the final answer.
`,
        provider: new R2SkillProvider(this.env.SKILLS, { prefix: "skills/" }),
      })
      .withContext("instructions", {
        description: "Rules for managing fitness records",
        provider: {
          async get() {
            const today = new Intl.DateTimeFormat("en-CA", {
              timeZone: "America/Toronto",
            }).format(new Date());

            return `
Today is ${today}.

Workspace rules:

1. Whenever the user reports a workout, write it to /workspace/logs/${today}.md.
2. Preserve previous entries when adding another workout on the same day.
3. Record the exercise, weight, repetitions, sets, duration, and how it felt.
4. Read /workspace/plan.md and update it after every workout report.
5. /workspace/plan.md must contain this week's completed and upcoming workouts.
6. When asked about previous workouts, list /workspace/logs and read the relevant files before answering.
7. Do not claim that a record was saved unless the workspace tool succeeded.
8. Always use the /workspace prefix for every file operation.
9. Never use /logs, /plan.md, or relative paths.
            `;
          },
        },
      });
  }
}

export default {
  async fetch(request, env) {
    return (
      (await routeAgentRequest(request, env)) ??
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
