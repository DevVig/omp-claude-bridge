#!/usr/bin/env node
// Recording proxy for Claude Code's API traffic.
//
// The bridge passes process.env through to the CC child, and the shipped SDK
// honours ANTHROPIC_BASE_URL, so pointing that at this server captures the exact
// request bodies CC sends. That is the only way to see whether a `--resume`
// boundary re-sends a prompt prefix that differs from what CC sent live, which is
// the open ~25% cold-resume finding in diag/AUDIT.md.
//
//   node diag/capture-proxy.mjs [--port 8787] [--out DIR]
//   ANTHROPIC_BASE_URL=http://127.0.0.1:8787 pi --model claude-bridge/...
//   node diag/diff-captures.mjs DIR
//
// Requests are written verbatim (they contain the conversation, so treat DIR as
// sensitive). Authorization headers are forwarded but only ever recorded as their
// key family (`sk-ant-oat01`, `sk-ant-api03`), which names the billing path a
// request took without writing credential material.
//
// A non-2xx also writes err-NNNN.json with the request headers, response headers
// and response body — the rate-limit and billing headers there are the record of
// what the server decided, and they are gone once the process exits.

import { createServer } from "node:http";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i === -1 ? fallback : args[i + 1];
};

const PORT = Number(flag("port", 8787));
const OUT = flag("out", `/tmp/cc-capture-${process.pid}`);
const UPSTREAM = "https://api.anthropic.com";

mkdirSync(OUT, { recursive: true });
const INDEX = join(OUT, "index.jsonl");

let seq = 0;

/** Header set minus credential material. `authorization` is reduced to its key
 *  family so a capture still shows whether a request authenticated as a
 *  subscription (oat) or an API key (api), which changes how it is billed. */
function safeHeaders(headers) {
	const out = {};
	for (const [k, v] of Object.entries(headers)) {
		if (k === "authorization") out[k] = `${String(v).split(" ")[0]} ${String(v).split(" ")[1]?.slice(0, 12) ?? ""}…`;
		else if (k === "x-api-key") out[k] = `${String(v).slice(0, 12)}…`;
		else out[k] = v;
	}
	return out;
}

/** cache_read/cache_creation off the SSE stream, so each captured request is
 *  paired with what the cache actually did for it. */
function usageFromSse(text) {
	const start = text.match(/^data: (\{"type":"message_start".*)$/m);
	if (!start) return null;
	try {
		const usage = JSON.parse(start[1]).message?.usage ?? {};
		return {
			input: usage.input_tokens ?? 0,
			cacheRead: usage.cache_read_input_tokens ?? 0,
			cacheWrite: usage.cache_creation_input_tokens ?? 0,
		};
	} catch {
		return null;
	}
}

createServer((req, res) => {
	const chunks = [];
	req.on("data", (c) => chunks.push(c));
	req.on("end", async () => {
		const body = Buffer.concat(chunks);
		const n = ++seq;

		const headers = { ...req.headers };
		delete headers.host;
		delete headers["content-length"];
		delete headers["accept-encoding"]; // keep the response readable for usage parsing

		let upstream;
		try {
			upstream = await fetch(`${UPSTREAM}${req.url}`, {
				method: req.method,
				headers,
				body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
			});
		} catch (error) {
			console.error(`[${n}] upstream failed: ${error.message}`);
			res.writeHead(502).end(String(error.message));
			return;
		}

		const text = await upstream.text();
		const responseHeaders = {};
		for (const [k, v] of upstream.headers) if (!["content-encoding", "content-length", "transfer-encoding"].includes(k)) responseHeaders[k] = v;
		res.writeHead(upstream.status, responseHeaders).end(text);

		let parsed = null;
		try { parsed = JSON.parse(body.toString("utf8")); } catch {}
		if (parsed) writeFileSync(join(OUT, `req-${String(n).padStart(4, "0")}.json`), JSON.stringify(parsed, null, 1));

		const requestHeaders = safeHeaders(headers);
		// /v1/ only: the SDK health-checks `/` with HEAD and takes the 404 in stride.
		if (upstream.status >= 300 && req.url.startsWith("/v1/")) {
			writeFileSync(join(OUT, `err-${String(n).padStart(4, "0")}.json`), JSON.stringify({
				n,
				at: new Date().toISOString(),
				status: upstream.status,
				path: req.url,
				requestHeaders,
				responseHeaders,
				responseBody: text,
			}, null, 1));
		}

		appendFileSync(INDEX, JSON.stringify({
			n,
			at: new Date().toISOString(),
			path: req.url,
			status: upstream.status,
			model: parsed?.model,
			messages: parsed?.messages?.length ?? null,
			tools: parsed?.tools?.length ?? null,
			usage: usageFromSse(text),
			betas: requestHeaders["anthropic-beta"] ?? null,
			auth: requestHeaders.authorization ?? requestHeaders["x-api-key"] ?? null,
		}) + "\n");
		const tag = upstream.status >= 300 ? ` ERROR → err-${String(n).padStart(4, "0")}.json` : "";
		console.error(`[${n}] ${req.method} ${req.url} → ${upstream.status} msgs=${parsed?.messages?.length ?? "-"}${tag}`);
	});
}).listen(PORT, "127.0.0.1", () => {
	console.error(`capture proxy on http://127.0.0.1:${PORT} → ${UPSTREAM}`);
	console.error(`writing to ${OUT}`);
});
