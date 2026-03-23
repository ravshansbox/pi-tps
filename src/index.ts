/**
 * Tokens Per Second Extension
 *
 * Displays generation statistics after each agent response completes.
 * Shows input/output tokens, cache usage, cost, duration, and tokens/second.
 *
 * Output format:
 *   ↑{input} ↓{output} [R{cacheRead}] [W{cacheWrite}] [${cost}] D{duration}s {tps}tps [{provider}, {email}]
 *
 * Example (all optional parts absent):
 *   ↑867.5k ↓6.3k D208.3s 30.4tps [openrouter]
 *
 * Example (optional parts present):
 *   ↑1.2k ↓345 R120 W30 $0.001 D2.3s 150.0tps [anthropic, user@example.com]
 */

import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";

// =============================================================================
// Types
// =============================================================================

function isAssistantMessage(message: unknown): message is AssistantMessage {
	if (!message || typeof message !== "object") return false;
	const role = (message as { role?: unknown }).role;
	return role === "assistant";
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format large numbers with k/m suffixes
 */
function fmt(n: number): string {
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "m";
	if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
	return n.toString();
}

/**
 * Get email from multi-provider-auth.json for a given provider.
 * Uses the same sha256-based round-robin index that the multi extensions use.
 */
function getProviderEmail(provider: string, sessionKey: string): string | null {
	try {
		const authPath = path.join(os.homedir(), ".pi", "agent", "multi-provider-auth.json");
		const store = JSON.parse(fs.readFileSync(authPath, "utf-8"));
		const accounts: { email?: string }[] = store[provider]?.accounts ?? [];
		if (accounts.length === 0) return null;

		// Mirror the hashIndex logic from the multi extensions
		const digest = createHash("sha256").update(sessionKey).digest();
		const index = digest.readUInt32BE(0) % accounts.length;
		return accounts[index]?.email ?? null;
	} catch {
		// Ignore errors, return null
	}
	return null;
}

// =============================================================================
// Extension Entry Point
// =============================================================================

export default function (pi: ExtensionAPI) {
	let agentStartMs: number | null = null;
	let currentSessionKey = "no-session";

	function getSessionKey(ctx: any): string {
		return ctx.sessionManager?.getSessionFile?.() ?? ctx.sessionManager?.getLeafId?.() ?? `ephemeral:${ctx.cwd}`;
	}

	pi.on("session_start", (_event, ctx) => {
		currentSessionKey = getSessionKey(ctx);
	});

	pi.on("agent_start", (_event, ctx) => {
		agentStartMs = Date.now();
		currentSessionKey = getSessionKey(ctx);
	});

	pi.on("agent_end", (event, ctx) => {
		if (!ctx.hasUI) return;
		if (agentStartMs === null) return;

		const elapsedMs = Date.now() - agentStartMs;
		agentStartMs = null;

		if (elapsedMs <= 0) return;

		// Aggregate token usage from all assistant messages
		let input = 0;
		let output = 0;
		let cacheRead = 0;
		let cacheWrite = 0;
		let cost = 0;

		for (const message of event.messages) {
			if (!isAssistantMessage(message)) continue;
			input += message.usage.input || 0;
			output += message.usage.output || 0;
			cacheRead += message.usage.cacheRead || 0;
			cacheWrite += message.usage.cacheWrite || 0;
			cost += message.usage.cost?.total || 0;
		}

		if (output <= 0) return;

		const elapsedSeconds = elapsedMs / 1000;
		const tokensPerSecond = output / elapsedSeconds;

		// Build display label
		const provider = ctx.model?.provider ?? "?";
		let login = provider;
		const email = getProviderEmail(provider, currentSessionKey);
		if (email && email !== provider) {
			login = `${provider}, ${email}`;
		}

		ctx.ui.notify(
			[
				`↑${fmt(input)}`,
				`↓${fmt(output)}`,
				cacheRead > 0 ? `R${fmt(cacheRead)}` : null,
				cacheWrite > 0 ? `W${fmt(cacheWrite)}` : null,
				cost > 0 ? `$${cost.toFixed(3)}` : null,
				`D${elapsedSeconds.toFixed(1)}s`,
				`${tokensPerSecond.toFixed(1)}tps`,
				`[${login}]`,
			].filter(Boolean).join(" "),
			"info",
		);
	});
}
