import type { App } from "obsidian";

/**
 * Schema for a tool's input parameters (JSON Schema subset).
 */
export interface ToolInputSchema {
	type: "object";
	properties: Record<string, { type: string; description?: string }>;
	required?: string[];
}

/**
 * Result returned by a tool execution.
 * Tools return structured data — never throw.
 */
export type ToolResult =
	| { success: true; data: Record<string, unknown> }
	| { success: false; error: string; code: string };

/**
 * A vault tool that can be invoked by the model.
 */
export interface Tool {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: ToolInputSchema;
	execute(args: Record<string, unknown>, app: App): Promise<ToolResult>;
}

/**
 * Registry for vault tools. Tools register at plugin load
 * and are dispatched by name during the tool-use loop.
 */
export class ToolRegistry {
	private tools = new Map<string, Tool>();

	register(tool: Tool): void {
		if (this.tools.has(tool.name)) {
			throw new Error(`Tool "${tool.name}" is already registered`);
		}
		this.tools.set(tool.name, tool);
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

	async execute(
		name: string,
		args: Record<string, unknown>,
		app: App,
	): Promise<ToolResult> {
		const tool = this.tools.get(name);
		if (!tool) {
			return { success: false, error: `Unknown tool: ${name}`, code: "unknown_tool" };
		}
		return tool.execute(args, app);
	}
}
