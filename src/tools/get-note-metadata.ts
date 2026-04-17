import { TFile } from "obsidian";
import type { App } from "obsidian";
import type { Tool, ToolInputSchema, ToolResult } from "./registry";

/**
 * Validate that a vault path is safe — no traversal, no absolute paths.
 */
function isValidVaultPath(path: string): boolean {
	if (!path || typeof path !== "string") return false;
	if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return false;
	const segments = path.split(/[/\\]/);
	for (const seg of segments) {
		if (seg === "..") return false;
	}
	return true;
}

export const getNoteMetadataTool: Tool = {
	name: "get_note_metadata",
	description:
		"Get metadata for a note without reading its full content. Returns frontmatter, tags, headings, backlinks, and outgoing links. Cheaper than read_note for triage.",
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
				content: "path is required and must be a non-empty string",
				isError: true,
			};
		}

		if (!isValidVaultPath(path)) {
			return {
				content:
					"Invalid path: must be vault-relative with no '..' traversal or absolute paths",
				isError: true,
			};
		}

		const abstractFile = app.vault.getAbstractFileByPath(path);

		if (!abstractFile) {
			return {
				content: `Note not found: ${path}`,
				isError: true,
			};
		}

		if (!(abstractFile instanceof TFile)) {
			return {
				content: `Path is a folder, not a file: ${path}`,
				isError: true,
			};
		}

		const cache = app.metadataCache.getFileCache(abstractFile);

		const frontmatter = cache?.frontmatter ?? undefined;

		const tags: string[] = [];
		if (cache?.tags) {
			for (const t of cache.tags) {
				tags.push(t.tag);
			}
		}
		// Also include tags from frontmatter
		if (frontmatter?.tags) {
			const fmTags = Array.isArray(frontmatter.tags)
				? frontmatter.tags
				: [frontmatter.tags];
			for (const t of fmTags) {
				const normalized = t.startsWith("#") ? t : `#${t}`;
				if (!tags.includes(normalized)) {
					tags.push(normalized);
				}
			}
		}

		const headings = cache?.headings?.map((h) => ({
			heading: h.heading,
			level: h.level,
		})) ?? [];

		const outgoingLinks = cache?.links?.map((l) => l.link) ?? [];

		// Build backlinks from resolvedLinks reverse index
		const backlinks: string[] = [];
		const resolvedLinks = app.metadataCache.resolvedLinks;
		for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
			if (path in (targets as Record<string, number>)) {
				backlinks.push(sourcePath);
			}
		}

		const result = {
			path,
			frontmatter,
			tags,
			headings,
			backlinks,
			outgoingLinks,
		};

		return { content: JSON.stringify(result) };
	},
};
