import { DurableObject } from 'cloudflare:workers';

export class DurableCounter extends DurableObject<Env> {
	sql: SqlStorage;
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql = ctx.storage.sql;

		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS counter (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				total INTEGER,
				ip VARCHAR,
				country CHAR,
				city CHAR,
				created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			)
			`);

		this.sql.exec(`
			INSERT OR IGNORE INTO counter (id, total) VALUES (1, 0);
			`);
	}

	increase(ip: string, country: string, city: string) {
		const { total } = this.sql.exec(`select total FROM counter ORDER BY id DESC LIMIT 1`).one() as { total: number };
		try {
			this.sql.exec(`INSERT INTO counter (total, ip, country, city) VALUES (?,?,?,?)`, total + 1, ip, country, city);
		} catch (error) {
			console.error('counter increase failed', {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});

			throw error;
		}
		return `count is ${total + 1}`;
	}
	decrease(ip: string, country: string, city: string) {
		const { total } = this.sql.exec(`select total FROM counter ORDER BY id DESC LIMIT 1`).one() as { total: number };
		this.sql.exec(`INSERT INTO counter (total, ip, country, city) VALUES (?,?,?,?)`, total - 1, ip, country, city);
		return `count is ${total - 1}`;
	}
	getCount() {
		const { total } = this.sql.exec(`select total FROM counter ORDER BY id DESC LIMIT 1`).one() as { total: number };
		return `count is ${total}`;
	}
	getHistory(): Record<string, SqlStorageValue>[] {
		const list = this.sql.exec(`select * FROM counter ORDER BY id DESC LIMIT 100`);
		return list.toArray();
	}
}

// POST /increment — count를 1 늘리고, 방문자의 IP·도시·국가와 함께 변경 내역을 기록합니다.
// POST /decrement — count를 1 줄이고, 같은 정보를 함께 기록합니다.
// GET /count — 현재 카운트를 반환합니다.
// GET /history — 최근 변경 100건을 IP·도시·국가와 함께 반환합니다.

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const { pathname } = new URL(request.url);
		const method = request.method;
		const headers = new Headers(request.headers);
		const ip = headers.get('cf-connecting-ip') ?? '';
		const country = request.cf?.country ?? '';
		const city = request.cf?.city ?? '';
		const dobj = env.DO.getByName('default');

		if (method === 'POST' && pathname === '/increment') {
			return new Response(await dobj.increase(ip, country, city));
		}
		if (method === 'POST' && pathname === '/decrement') {
			return new Response(await dobj.decrease(ip, country, city));
		}
		if (method === 'GET' && pathname === '/count') {
			return new Response(await dobj.getCount());
		}
		if (method === 'GET' && pathname === '/history') {
			const history = await dobj.getHistory();

			return new Response(JSON.stringify(history), {
				headers: {
					'Content-Type': 'application/json',
				},
			});
		}
		return new Response(null, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
