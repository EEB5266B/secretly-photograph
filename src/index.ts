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

interface Env {
	BUCKET: R2Bucket;
	DB: D1Database;
	ASSETS: Fetcher;
}

interface KeyRow {
	key: string;
	value: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		const getUserInfo = () => {
			return {
				ip: request.headers.get('CF-Connecting-IP') || 'unknown',
				userAgent: request.headers.get('User-Agent') || 'unknown',
			};
		};

		if (url.pathname.startsWith('/api/geturlmap/') && request.method === 'GET') {
			const pathname = url.pathname.replace('/api/geturlmap/', '');

			console.log(pathname);
			const result = await env.DB.prepare('SELECT key, value FROM url_map WHERE key = ?').bind(pathname).first<KeyRow>();

			if (result) {
				return new Response(result.value);
			} else {
				return new Response();
			}
		}

		if (url.pathname === '/api/getflag' && request.method === 'GET') {
			const { results } = await env.DB.prepare('SELECT key, value FROM flag').all<KeyRow>();

			const map: Record<string, string> = {};
			for (const row of results) {
				map[row.key] = row.value;
			}

			return Response.json(map);
		}

		if (url.pathname === '/api/addrecords' && request.method === 'POST') {
			const body = (await request.json()) as { user?: string; message?: string };
			const userInfo = getUserInfo();

			await env.DB.prepare('INSERT INTO records (user, ip, user_agent, message) VALUES (?, ?, ?, ?)')
				.bind(body.user, userInfo.ip, userInfo.userAgent, body.message)
				.run();

			return new Response();
		}

		if (url.pathname === '/api/upload' && request.method === 'POST') {
			const body = (await request.json()) as { photo?: string; name?: string };

			console.log(body.photo);

			const base64Data = body.photo?.replace(/^data:.*?;base64,/, '');
			if (base64Data && body.name) {
				const binary = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
				await env.BUCKET.put(body.name, binary, {
					httpMetadata: { contentType: 'image/jpeg' },
				});
			} else {
				console.error(`上传文件异常：${JSON.stringify(body)}`);
			}

			return new Response();;
		}

		if (url.pathname === '/api/files' && request.method === 'GET') {
			const listed = await env.BUCKET.list();
			const files = listed.objects.map((obj) => ({
				key: obj.key,
				size: obj.size,
				uploaded: obj.uploaded,
			}));

			return Response.json(files);
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
