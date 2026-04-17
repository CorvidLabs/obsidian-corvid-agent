/**
 * Provider-agnostic tool registry for vault tools.
 * Tools register here; the dispatch loop in corvid-client resolves them.
 */
import type { App } from "obsidian";

export interface ToolInputSchema {
	type: "object";
	properties: Record<string, { type: string; description?: string }>;
	required?: string[];
}

export interface Tool {
	name: string;
	description: string;
	inputSchema: ToolInputSchema;
	execute(args: Record<string, unknown>, app: App): Promise<ToolResult>;
}

export interface ToolResult {
	content: string;
	isError?: boolean;
}

export interface ToolCall {
	id: string;
	name: string;
	input: Record<string, unknown>;
}

export type ToolCallStatus = "pending" | "running" | "done" | "error";

export interface ToolCallRecord {
	call: ToolCall;
	status: ToolCallStatus;
	result?: ToolResult;
}

export class ToolRegistry {
	private tools = new Map<string, Tool>();
	private app: App | null = null;

	setApp(app: App): void {
		this.app = app;
	}

	register(tool: Tool): void {
		this.tools.set(tool.name, tool);
	}

	unregister(name: string): void {
		this.tools.delete(name);
	}

	get(name: string): Tool | undefined {
		return this.tools.get(name);
	}

	has(name: string): boolean {
		return this.tools.has(name);
	}

	list(): Tool[] {
		return Array.from(this.tools.values());
	}

	getSchemas(): { name: string; description: string; input_schema: ToolInputSchema }[] {
		return this.list().map((t) => ({
			name: t.name,
			description: t.description,
			input_schema: t.inputSchema,
		}));
	}

	async execute(call: ToolCall): Promise<ToolResult> {
		const tool = this.tools.get(call.name);
		if (!tool) {
			return { content: `Unknown tool: ${call.name}`, isError: true };
		}
		if (!this.app) {
			return { content: "App not available for tool execution", isError: true };
		}
		try {
			return await tool.execute(call.input, this.app);
		} catch (err) {
			return {
				content: err instanceof Error ? err.message : String(err),
				isError: true,
			};
		}
	}
}
