import { TFile, TFolder } from "obsidian";
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

interface Entry {
	path: string;
	type: "note" | "folder" | "asset";
}

function collectEntries(folder: TFolder, recursive: boolean): Entry[] {
	const entries: Entry[] = [];

	for (const child of folder.children) {
		if (child instanceof TFolder) {
			entries.push({ path: child.path, type: "folder" });
			if (recursive) {
				entries.push(...collectEntries(child, true));
			}
		} else if (child instanceof TFile) {
			if (child.extension === "md") {
				entries.push({ path: child.path, type: "note" });
			} else {
				entries.push({ path: child.path, type: "asset" });
			}
		}
	}

	return entries;
}

export const listNotesTool: Tool = {
	name: "list_notes",
	description:
		"List notes and folders in the vault. Returns directory entries so the model can navigate vault structure.",
	inputSchema: {
		type: "object",
		properties: {
			folder: {
				type: "string",
				description:
					"Vault-relative folder path to list (e.g. 'Projects'). Defaults to vault root.",
			},
			recursive: {
				type: "boolean",
				description:
					"If true, returns the full subtree. Defaults to false (direct children only).",
			},
		},
		required: [],
	} as ToolInputSchema,

	async execute(
		args: Record<string, unknown>,
		app: App,
	): Promise<ToolResult> {
		const folderPath =
			typeof args.folder === "string" ? args.folder.trim() : "";
		const recursive = args.recursive === true;

		// Validate path if provided
		if (folderPath && !isValidVaultPath(folderPath)) {
			return {
				content: JSON.stringify({ error: "invalid_path" }),
				isError: true,
			};
		}

		let targetFolder: TFolder;

		if (!folderPath || folderPath === "" || folderPath === "/") {
			// Vault root
			targetFolder = app.vault.getRoot();
		} else {
			const abstractFile =
				app.vault.getAbstractFileByPath(folderPath);

			if (!abstractFile) {
				return {
					content: JSON.stringify({ error: "not_found" }),
					isError: true,
				};
			}

			if (!(abstractFile instanceof TFolder)) {
				return {
					content: JSON.stringify({ error: "not_found" }),
					isError: true,
				};
			}

			targetFolder = abstractFile;
		}

		const entries = collectEntries(targetFolder, recursive);

		return {
			content: JSON.stringify({
				folder: folderPath || "/",
				entries,
			}),
		};
	},
};
