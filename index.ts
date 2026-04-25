import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

function isAssistantMessage(message: unknown): message is AssistantMessage {
	if (!message || typeof message !== "object") return false;
	const role = (message as { role?: unknown }).role;
	return role === "assistant";
}

function formatCompact(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
	return Math.round(value).toString();
}

function formatCost(value: number): string {
	return Number(value.toFixed(3)).toString();
}

export default function (pi: ExtensionAPI) {
	let agentStartMs: number | null = null;

	pi.on("agent_start", () => {
		agentStartMs = Date.now();
	});

	pi.on("agent_end", (event, ctx) => {
		if (!ctx.hasUI) return;
		if (agentStartMs === null) return;

		const elapsedMs = Date.now() - agentStartMs;
		agentStartMs = null;
		if (elapsedMs <= 0) return;

		let input = 0;
		let output = 0;
		let cacheRead = 0;
		let cacheWrite = 0;
		let totalTokens = 0;
		let totalCost = 0;

		for (const message of event.messages) {
			if (!isAssistantMessage(message)) continue;
			input += message.usage.input || 0;
			output += message.usage.output || 0;
			cacheRead += message.usage.cacheRead || 0;
			cacheWrite += message.usage.cacheWrite || 0;
			totalTokens += message.usage.totalTokens || 0;
			totalCost += message.usage.cost?.total || 0;
		}

		if (output <= 0) return;

		const elapsedSeconds = elapsedMs / 1000;
		const tokensPerSecond = output / elapsedSeconds;
		const parts: string[] = [];

		if (input > 0) parts.push(`↑${formatCompact(input)}`);
		if (output > 0) parts.push(`↓${formatCompact(output)}`);
		if (cacheRead > 0) parts.push(`R${formatCompact(cacheRead)}`);
		if (cacheWrite > 0) parts.push(`W${formatCompact(cacheWrite)}`);
		parts.push(`↯${Number(tokensPerSecond.toFixed(1)).toString()}`);
		parts.push(`${elapsedSeconds.toFixed(1)}s`);
		if (totalCost > 0) parts.push(`$${formatCost(totalCost)}`);

		ctx.ui.notify(parts.join(" "), "info");
	});
}
