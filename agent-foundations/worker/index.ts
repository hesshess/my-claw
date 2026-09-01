/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../worker-configuration.d.ts" />
/* eslint-enable @typescript-eslint/triple-slash-reference */

import {
  Agent,
  callable,
  getCurrentAgent,
  routeAgentRequest,
  type AgentContext,
  type Connection,
  type ConnectionContext,
} from "agents";

export type PollOption = {
  id: number;
  label: string;
  votes: number;
};

export type PollState = {
  question: string;
  options: PollOption[];
  closed: boolean;
};

type PollEnv = Env & {
  ROOM_TOKEN: string;
};

type PollConnectionState = {
  city: string;
};

type RequestWithCf = Request & {
  cf?: {
    city?: unknown;
  };
};

export class PollAgent extends Agent<PollEnv, PollState> {
  private readonly pollEnv: PollEnv;

  constructor(ctx: AgentContext, env: PollEnv) {
    super(ctx, env);
    this.pollEnv = env;
  }

  initialState: PollState = {
    question: "What is your favorite season",
    options: [
      { id: 1, label: "spring", votes: 0 },
      { id: 2, label: "summer", votes: 0 },
      { id: 3, label: "fall", votes: 0 },
      { id: 4, label: "winter", votes: 0 },
    ],
    closed: false,
  };

  async onStart() {
    // 기존 채팅 Agent의 상태가 남아 있다면 투표 상태로 한 번 초기화합니다.
    if (!Array.isArray(this.state.options)) {
      this.setState(this.initialState);
    }

    // 각 투표의 선택지, 시간, 도시를 남기는 이력 테이블입니다.
    void this.sql`
      CREATE TABLE IF NOT EXISTS votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        option_id INTEGER NOT NULL,
        option_label TEXT NOT NULL,
        city TEXT NOT NULL,
        voted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Durable Object가 다시 깨어나도 이미 잡힌 마감 예약은 유지합니다.
    const schedules = await this.listSchedules();
    const hasCloseSchedule = schedules.some(
      (schedule) => schedule.callback === "closePoll",
    );

    if (!this.state.closed && !hasCloseSchedule) {
      const closesAt = new Date(Date.now() + 5 * 60 * 1000);
      await this.schedule(closesAt, "closePoll", {}, { idempotent: true });
    }
  }

  shouldConnectionBeReadonly(
    _connection: Connection,
    ctx: ConnectionContext,
  ): boolean {
    const url = new URL(ctx.request.url);
    return url.searchParams.get("readonly") === "true";
  }

  onConnect(
    connection: Connection<PollConnectionState>,
    ctx: ConnectionContext,
  ) {
    const url = new URL(ctx.request.url);
    const token = url.searchParams.get("token");

    if (token !== this.pollEnv.ROOM_TOKEN) {
      connection.close(4001, "Invalid room token");
      return;
    }

    // callable 메서드에서는 원래 요청의 request.cf를 읽을 수 없으므로,
    // 연결될 때 도시를 연결 상태에 보관합니다.
    const request = ctx.request as RequestWithCf;
    const city =
      typeof request.cf?.city === "string" ? request.cf.city : "Unknown";

    connection.setState({ city });
  }

  @callable()
  vote(optionId: number) {
    const { connection } = getCurrentAgent<PollAgent>();

    if (!connection) throw new Error("Connection not found");
    if (this.isConnectionReadonly(connection)) {
      throw new Error("Readonly clients cannot vote");
    }
    if (this.state.closed) throw new Error("Poll is closed");

    const option = this.state.options.find((item) => item.id === optionId);
    if (!option) throw new Error("Option not found");

    const city =
      (connection.state as PollConnectionState | null)?.city ?? "Unknown";

    void this.sql`
      INSERT INTO votes (option_id, option_label, city)
      VALUES (${optionId}, ${option.label}, ${city})
    `;

    this.setState({
      ...this.state,
      options: this.state.options.map((item) =>
        item.id === optionId ? { ...item, votes: item.votes + 1 } : item,
      ),
    });
  }

  @callable()
  addOption(label: string) {
    const { connection } = getCurrentAgent<PollAgent>();

    if (!connection) throw new Error("Connection not found");
    if (this.isConnectionReadonly(connection)) {
      throw new Error("Readonly clients cannot add options");
    }
    if (this.state.closed) throw new Error("Poll is closed");

    const trimmedLabel = label.trim();
    if (!trimmedLabel) throw new Error("Option label is required");
    if (trimmedLabel.length > 50) throw new Error("Option label is too long");

    const alreadyExists = this.state.options.some(
      (option) => option.label.toLowerCase() === trimmedLabel.toLowerCase(),
    );
    if (alreadyExists) throw new Error("Option already exists");

    const nextId =
      Math.max(0, ...this.state.options.map((option) => option.id)) + 1;

    this.setState({
      ...this.state,
      options: [
        ...this.state.options,
        { id: nextId, label: trimmedLabel, votes: 0 },
      ],
    });
  }

  @callable()
  async reset() {
    const { connection } = getCurrentAgent<PollAgent>();

    if (!connection) throw new Error("Connection not found");
    if (this.isConnectionReadonly(connection)) {
      throw new Error("Readonly clients cannot reset");
    }

    // 이전 마감 예약을 지우지 않으면 새 투표가 예정보다 빨리 닫힐 수 있습니다.
    const schedules = await this.listSchedules();
    for (const schedule of schedules) {
      if (schedule.callback === "closePoll") {
        await this.cancelSchedule(schedule.id);
      }
    }

    this.setState({
      ...this.state,
      options: this.state.options.map((option) => ({ ...option, votes: 0 })),
      closed: false,
    });

    const closesAt = new Date(Date.now() + 5 * 60 * 1000);
    await this.schedule(closesAt, "closePoll");
  }

  async closePoll() {
    if (this.state.closed) return;

    this.setState({
      ...this.state,
      closed: true,
    });
  }
}

export default {
  async fetch(request: Request, env: PollEnv) {
    const agentResponse = await routeAgentRequest(request, env, {
      // onConnect 전에 WebSocket 업그레이드 자체를 막아 상태 노출을 방지합니다.
      onBeforeConnect(connectRequest) {
        const token = new URL(connectRequest.url).searchParams.get("token");

        if (token !== env.ROOM_TOKEN) {
          return new Response("Invalid room token", { status: 401 });
        }
      },
    });
    if (agentResponse) return agentResponse;

    return new Response(null, { status: 404 });
  },
};
