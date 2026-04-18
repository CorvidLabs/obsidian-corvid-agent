import type { App } from "obsidian";
import type { Tool, ToolInputSchema, ToolResult } from "./registry";
import type { CorvidClient } from "../corvid-client";

/**
 * Model-invokable tool that recalls memories from the corvid-agent backend.
 * Only registered when `settings.provider === "corvid-agent"`.
 */
export function createRecallMemoryTool(client: CorvidClient): Tool {
	return {
		name: "recall_memory",
		description:
			"Recall memories from the agent's on-chain memory store. Provide either an exact key for direct lookup or a query string for semantic search.",
		inputSchema: {
			type: "object",
			properties: {
				key: {
					type: "string",
					description:
						"Exact memory key for direct lookup (e.g. 'user-leif', 'project-corvid-agent')",
				},
				query: {
					type: "string",
					description:
						"Search query for semantic memory lookup (e.g. 'what is the team roster')",
				},
			},
		} as ToolInputSchema,

		async execute(
			args: Record<string, unknown>,
			_app: App,
		): Promise<ToolResult> {
			const key = typeof args.key === "string" ? args.key.trim() : undefined;
			const query =
				typeof args.query === "string" ? args.query.trim() : undefined;

			if (!key && !query) {
				return {
					content:
						"At least one of 'key' or 'query' must be provided",
					isError: true,
				};
			}

			try {
				const results = await client.recallMemory({
					...(key ? { key } : {}),
					...(query ? { query } : {}),
				});

				return {
					content: JSON.stringify({ results }),
				};
			} catch (err) {
				return {
					content: `Failed to recall memory: ${err instanceof Error ? err.message : String(err)}`,
					isError: true,
				};
			}
		},
	};
}
