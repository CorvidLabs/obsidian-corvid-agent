import { prepareSimpleSearch, type TFile } from "obsidian";
import type { App } from "obsidian";
import type { Tool, ToolInputSchema, ToolResult } from "./registry";

interface SearchResult {
	path: string;
	snippet: string;
	score: number;
}

/**
 * Extract a ~160 character snippet around the first match position.
 */
function extractSnippet(content: string, matchPosition: number): string {
	const snippetLength = 160;
	const half = Math.floor(snippetLength / 2);
	let start = Math.max(0, matchPosition - half);
	let end = Math.min(content.length, start + snippetLength);

	if (end - start < snippetLength) {
		start = Math.max(0, end - snippetLength);
	}

	let snippet = content.slice(start, end).replace(/\n/g, " ");
	if (start > 0) snippet = "..." + snippet;
	if (end < content.length) snippet = snippet + "...";
	return snippet;
}

export const searchNotesTool: Tool = {
	name: "search_notes",
	description:
		"Full-text search across all markdown notes in the vault. Returns ranked results with path, snippet, and relevance score.",
	inputSchema: {
		type: "object",
		properties: {
			query: {
				type: "string",
				description: "Search query string",
			},
			limit: {
				type: "number",
				description:
					"Maximum number of results to return (default 20)",
			},
		},
		required: ["query"],
	} as ToolInputSchema,

	async execute(
		args: Record<string, unknown>,
		app: App,
	): Promise<ToolResult> {
		const query = args.query;
		const limit =
			typeof args.limit === "number" && args.limit > 0
				? Math.floor(args.limit)
				: 20;

		if (typeof query !== "string" || !query.trim()) {
			return {
				content: "query is required and must be a non-empty string",
				isError: true,
			};
		}

		const trimmedQuery = query.trim();
		const fuzzySearch = prepareSimpleSearch(trimmedQuery);
		const files: TFile[] = app.vault.getMarkdownFiles();
		const scored: { file: TFile; score: number; matchPos: number; matchContent: string }[] = [];

		for (const file of files) {
			// Check filename match
			const nameMatch = fuzzySearch(file.path);
			let bestScore = nameMatch ? nameMatch.score : null;
			let matchPosition = 0;
			let matchContent = file.path;

			// Check cached headings and tags (fast)
			const cache = app.metadataCache.getFileCache(file);
			if (cache) {
				if (cache.headings) {
					for (const heading of cache.headings) {
						const m = fuzzySearch(heading.heading);
						if (m && (bestScore === null || m.score < bestScore)) {
							bestScore = m.score;
							matchPosition = heading.position.start.offset;
							matchContent = "";
						}
					}
				}
				if (cache.tags) {
					for (const tag of cache.tags) {
						const m = fuzzySearch(tag.tag);
						if (m && (bestScore === null || m.score < bestScore)) {
							bestScore = m.score;
							matchPosition = tag.position.start.offset;
							matchContent = "";
						}
					}
				}
			}

			// Full-text content search
			let content: string | null = null;
			try {
				content = await app.vault.cachedRead(file);
			} catch {
				continue;
			}

			if (content) {
				const contentMatch = fuzzySearch(content);
				if (contentMatch && (bestScore === null || contentMatch.score < bestScore)) {
					bestScore = contentMatch.score;
					matchPosition =
						contentMatch.matches && contentMatch.matches.length > 0
							? contentMatch.matches[0][0]
							: 0;
					matchContent = content;
				}
			}

			if (bestScore !== null) {
				scored.push({
					file,
					score: bestScore,
					matchPos: matchPosition,
					matchContent: matchContent || content || file.path,
				});
			}
		}

		// Sort by score (lower = better match in Obsidian's API)
		scored.sort((a, b) => a.score - b.score);
		const topScored = scored.slice(0, limit);

		// Build results with normalized 0-1 scores (1 = best)
		const results: SearchResult[] = topScored.map((item) => {
			const snippet = extractSnippet(item.matchContent, item.matchPos);
			return { path: item.file.path, snippet, score: 0 };
		});

		if (results.length > 0) {
			const rawScores = topScored.map((s) => s.score);
			const worst = Math.max(...rawScores);
			const best = Math.min(...rawScores);
			const range = worst - best || 1;
			for (let i = 0; i < results.length; i++) {
				results[i].score =
					Math.round(((worst - topScored[i].score) / range) * 100) / 100;
			}
		}

		return {
			content: JSON.stringify({ results }),
		};
	},
};
