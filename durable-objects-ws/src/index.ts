import { DurableObject } from 'cloudflare:workers';


type DeletedMessage = {
	id: number;
};

type MessageCount = {
	count: number;
};

export class DurableChatroom extends DurableObject<Env> {
	sql: SqlStorage;
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql = ctx.storage.sql;

		this.sql.exec(`
        CREATE TABLE IF NOT EXISTS chatroom (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
	        nickname TEXT NOT NULL,
	        message TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at INTEGER NOT NULL
        )
        `);
	}

	fetch(request: Request) {
		const url = new URL(request.url);
		const nickname = url.searchParams.get('nickname') ?? 'anon';
		const webSockerPair = new WebSocketPair();
		const [client, server] = Object.values(webSockerPair);

		this.ctx.acceptWebSocket(server);
		server.serializeAttachment({ nickname });

		return new Response(null, { status: 101, webSocket: client });
	}

	broadcast(message: string, ws?: WebSocket) {
		for (const socket of this.ctx.getWebSockets()) {
			socket.send(message);
		}
	}

	getStoredMessageCount(): number {
	const { count } = this.sql
		.exec<MessageCount>(`
			SELECT COUNT(*) AS count
			FROM chatroom
		`)
		.one();

	return count;
}

async alarm(): Promise<void> {
	try {
		const deletedMessages = this.sql
			.exec<DeletedMessage>(
				`
					DELETE FROM chatroom
					WHERE expires_at <= ?
					RETURNING id
				`,
				Date.now(),
			)
			.toArray();

		// 삭제된 메시지가 있을 때만 클라이언트에 알립니다.
		if (deletedMessages.length > 0) {
			const deletedIds = deletedMessages.map(({ id }) => id);
			const messageCount = this.getStoredMessageCount();

			this.broadcast(
				JSON.stringify({
					deletedIds,
					deletedCount: deletedIds.length,
					currentMessageCount: messageCount,
				}),
			);
		}
	} finally {
		// 오류가 발생하더라도 다음 정리 작업은 계속 실행되게 합니다.
		await this.ctx.storage.setAlarm(Date.now() + 60_000);
	}
}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		const expiresAt = Date.now() + 5 * 60_000;
		const { nickname } = ws.deserializeAttachment() as { nickname: string };
		this.sql.exec(
			`
        INSERT OR IGNORE INTO chatroom (nickname, message, expires_at) VALUES (?, ?, ?);
        `,
			nickname,
			message,
			expiresAt,
		);
		const currentAlarm = await this.ctx.storage.getAlarm();
		if (currentAlarm === null) {
			await this.ctx.storage.setAlarm(Date.now() + 60_000);
		}
		const messageCount = this.getStoredMessageCount();

		

		this.broadcast(
		JSON.stringify({
			nickname,
			message,
			messageCount,
		}),
	);
	}

	webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): void | Promise<void> {
		const { nickname } = ws.deserializeAttachment() as { nickname: string };
		this.broadcast(`${nickname} has left the chatroom.`);
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const { pathname, searchParams } = new URL(request.url);
		if (pathname === '/ws') {
			const roomId = searchParams.get('roomId') ?? 'public';
			const upgrade = request.headers.get('Upgrade');
			if (upgrade) {
				const dp = env.DO.getByName(roomId);
				return dp.fetch(request);
			}
		}
		return new Response(null, {
			status: 404,
		});
	},
} satisfies ExportedHandler<Env>;
