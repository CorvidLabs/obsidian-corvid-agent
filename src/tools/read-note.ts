import { TFile } from "obsidian";
import type { App } from "obsidian";
import type { Tool, ToolInputSchema, ToolResult } from "./registry";

/**
 * Validate that a vault path is safe — no traversal, no absolute paths.
 */
function isValidVaultPath(path: string): boolean {
	if (!path || typeof path !== "string") return false;
	// Reject absolute paths (Unix or Windows)
	if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return false;
	// Reject directory traversal
	const segments = path.split(/[/\\]/);
	for (const seg of segments) {
		if (seg === "..") return false;
	}
	return true;
}

export const readNoteTool: Tool = {
	name: "read_note",
	description:
		"Read a specific note from the vault by path. Returns the note content and parsed frontmatter.",
	inputSchema: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description:
					"Vault-relative path to the note (e.g. 'Templates/daily.md')",
			},
		},
		required: ["path"],
	} as ToolInputSchema,

	async execute(
		args: Record<string, unknown>,
		app: App,
	): Promise<ToolResult> {
		const path = args.path;

		if (typeof path !== "string" || !path.trim()) {
			return {
				success: false,
				error: "path is required and must be a non-empty string",
				code: "invalid_path",
			};
		}

		if (!isValidVaultPath(path)) {
			return {
				success: false,
				error:
					"Invalid path: must be vault-relative with no '..' traversal or absolute paths",
				code: "invalid_path",
			};
		}

		const abstractFile = app.vault.getAbstractFileByPath(path);

		if (!abstractFile) {
			return {
				success: false,
				error: `Note not found: ${path}`,
				code: "not_found",
			};
		}

		if (!(abstractFile instanceof TFile)) {
			return {
				success: false,
				error: `Path is a folder, not a file: ${path}`,
				code: "not_found",
			};
		}

		const content = await app.vault.read(abstractFile);
		const cache = app.metadataCache.getFileCache(abstractFile);
		const frontmatter = cache?.frontmatter ?? undefined;

		const data: Record<string, unknown> = { path, content };
		if (frontmatter) {
			data.frontmatter = frontmatter;
		}

		return { success: true, data };
	},
};
