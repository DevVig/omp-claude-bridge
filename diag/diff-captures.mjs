#!/usr/bin/env node
// Diff consecutive captured requests to name what broke the prompt cache.
//
//   node diag/diff-captures.mjs <capture-dir>
//
// Pairs each /v1/messages request with the previous one and reports the first
// position where the prompt prefix diverges — system block, tool list, or a
// specific message. A healthy continuation appends only: every earlier element is
// byte-identical, and `cacheRead` covers the whole previous prompt. A cold resume
// shows up as `cacheRead` collapsing to the preamble (or zero) with a named
// divergence, or as no divergence at all — which would put the cause server-side
// rather than in the bytes we send.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2];
if (!DIR) {
	console.error("usage: node diag/diff-captures.mjs <capture-dir>");
	process.exit(2);
}

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);

const requests = readdirSync(DIR)
	.filter((f) => /^req-\d+\.json$/.test(f))
	.sort()
	.map((f) => ({ file: f, body: JSON.parse(readFileSync(join(DIR, f), "utf8")) }))
	// Main-loop requests only. CC also issues toolless side requests (conversation
	// titles, summaries) whose prompt shares no prefix with the agent loop, and
	// pairing one of those with its neighbour invents a boundary.
	.filter((r) => Array.isArray(r.body.messages) && (r.body.tools?.length ?? 0) > 0);

const usageByN = new Map();
for (const line of readFileSync(join(DIR, "index.jsonl"), "utf8").split("\n").filter(Boolean)) {
	const row = JSON.parse(line);
	if (row.usage) usageByN.set(row.n, row.usage);
}
const nOf = (file) => Number(file.match(/\d+/)[0]);

/** The prompt prefix as a flat list of comparable elements, in wire order. */
function elements(body) {
	const out = [];
	const system = Array.isArray(body.system) ? body.system : body.system ? [body.system] : [];
	system.forEach((block, i) => out.push({ label: `system[${i}]`, hash: hash(block), value: block }));
	out.push({ label: `tools(${body.tools?.length ?? 0})`, hash: hash(body.tools ?? []), value: body.tools ?? [] });
	body.messages.forEach((msg, i) => {
		const kinds = Array.isArray(msg.content) ? msg.content.map((b) => b.type).join("+") : "text";
		out.push({ label: `messages[${i}] ${msg.role}/${kinds}`, hash: hash(msg), value: msg });
	});
	return out;
}

function describe(value) {
	const text = JSON.stringify(value);
	return text.length > 300 ? `${text.slice(0, 300)}…(${text.length}b)` : text;
}

console.log(`${requests.length} captured /v1/messages requests in ${DIR}\n`);

let cold = 0;
let boundaries = 0;
for (let i = 1; i < requests.length; i++) {
	// A capture dir can hold more than one pi session, and the first request of a
	// session is cold by definition — comparing it to the previous session's last
	// request invents a boundary that never existed.
	if (requests[i].body.messages.length <= requests[i - 1].body.messages.length) {
		console.log(`--- ${requests[i - 1].file} → ${requests[i].file}  [new session, not a boundary]\n`);
		continue;
	}
	boundaries++;
	const prev = elements(requests[i - 1].body);
	const curr = elements(requests[i].body);
	const prevUsage = usageByN.get(nOf(requests[i - 1].file));
	const usage = usageByN.get(nOf(requests[i].file));

	// What the previous request demonstrably left cached — read plus write. Its
	// `input` is excluded on purpose: those tokens were not cached by that request,
	// and a turn that just ran tools sends its whole result payload as uncached
	// `input`, so counting it invents a shortfall on exactly the tool-heavy
	// boundaries this is meant to judge.
	const expected = prevUsage ? prevUsage.cacheRead + prevUsage.cacheWrite : null;
	const shortfall = expected !== null && usage ? expected - usage.cacheRead : null;
	const isCold = shortfall !== null && shortfall >= 2000;
	if (isCold) cold++;

	let firstDiff = -1;
	for (let k = 0; k < Math.min(prev.length, curr.length); k++) {
		if (prev[k].hash !== curr[k].hash) { firstDiff = k; break; }
	}

	const verdict = isCold ? "COLD" : "warm";
	console.log(`--- ${requests[i - 1].file} → ${requests[i].file}  [${verdict}]`);
	console.log(`    prompt elements ${prev.length} → ${curr.length}, cacheRead ${usage?.cacheRead ?? "?"} vs ${expected ?? "?"} expected` +
		(shortfall !== null ? ` (shortfall ${shortfall})` : ""));

	if (firstDiff === -1) {
		const grew = curr.length > prev.length;
		console.log(`    prefix identical for all ${Math.min(prev.length, curr.length)} shared elements` +
			(grew ? `, ${curr.length - prev.length} appended` : prev.length > curr.length ? `, ${prev.length - curr.length} dropped` : ""));
		if (isCold) console.log("    >>> cold with a byte-identical prefix — not our bytes");
	} else {
		console.log(`    >>> first divergence at ${firstDiff}: ${prev[firstDiff].label} → ${curr[firstDiff].label}`);
		console.log(`        was: ${describe(prev[firstDiff].value)}`);
		console.log(`        now: ${describe(curr[firstDiff].value)}`);
	}
	console.log();
}

console.log(`${cold} of ${boundaries} boundaries cold (shortfall >= 2000 tokens)`);
