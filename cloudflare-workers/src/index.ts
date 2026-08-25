/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const method = request.method;
		const path = url.pathname;

		if (method === 'GET' && path === '/') {
			return new Response(
				`
	<!DOCTYPE html>
	<html>
		<head>
			<title>KV Note Store</title>
		</head>
		<body>
			<h1>KV Note Store</h1>
			<h4>POST /notes/:key</h4>
				<p>:write a note</p>
			<h4>GET /notes/:key</h4>
<p>:read the note</p>
			<h4>GET /notes</h4>
<p>:read the list of notes</p>
		</body>
	</html>
	`,
				{
					headers: {
						'Content-Type': 'text/html',
					},
				},
			);
		}

		if (method === 'GET' && path === '/notes') {
			const result = await env.NOTES.list();
			const keys = result.keys.map((item) => item.name);

			return Response.json(keys)
		}

		if (path.startsWith('/notes/')) {
			const key = path.slice('/notes/'.length);

			if (method === 'POST') {
				const value = await request.text();
				await env.NOTES.put(key, value);

				return new Response('저장되었습니다', { status: 201 });
			}

			if (method === 'GET') {
				const value = await env.NOTES.get(key);

				if (value === null) {
					return new Response('없는 노트입니다', { status: 404 });
				}
				return new Response(value);
			}
		}

		return new Response('노트가 비어있습니다', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
