// Per-agent Claude Code session state.
//
// Extracted from index.ts so tests can import without activating the extension.

import type { ProviderSessionState } from "@oh-my-pi/pi-ai";
import { PROVIDER_ID } from "./convert.js";

export interface SessionState {
	sessionId: string;
	cursor: number;
	cwd: string;
	// Force the next syncSession call down the REBUILD path. Set when
	// pi has mutated its messages array out from under us (compact, tree
	// navigation) or after an abort left the JSONL in an indeterminate state.
	// REBUILD wipes and rewrites the file to match pi's current history.
	needsRebuild?: boolean;
	// Set ONLY after an abort. The killed CC subprocess may still be flushing
	// a late "[Request interrupted by user]" record to the session JSONL.
	// Reusing the same sessionId/path would race that orphan write into our
	// fresh file and break CC's parent-uuid chain on the next resume. When
	// this flag is set, REBUILD takes a fresh UUID and skips deleteSession
	// so the orphan writes land on a dead inode. Compact/tree do NOT set
	// this — there's no concurrent CC writer during those events, so
	// in-place rebuild (preserve UUID, deleteSession + createSession) is safe.
	forceRotate?: boolean;
}

// One Claude Code session per OMP provider session. Main agents, in-process
// subagents and side requests each carry their own provider sessionId, so their
// cursors and resume ids never mix. Entries live in OMP's providerSessionState
// map, which closes them on new/switched/fresh sessions and on dispose.
export class BridgeSession implements ProviderSessionState {
	state: SessionState | null = null;
	constructor(readonly id?: string) {}
	close(): void {
		this.state = null;
		if (this.id && bridgeSessions.get(this.id) === this) bridgeSessions.delete(this.id);
	}
}

export const bridgeSessions = new Map<string, BridgeSession>();

export function bridgeSession(sessionId: string | undefined, states?: Map<string, ProviderSessionState>): BridgeSession {
	const session = (sessionId && bridgeSessions.get(sessionId)) || new BridgeSession(sessionId);
	if (sessionId) {
		bridgeSessions.set(sessionId, session);
		states?.set(`${PROVIDER_ID}:${sessionId}`, session);
	}
	return session;
}
