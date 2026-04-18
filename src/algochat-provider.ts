import {
	AlgorandService,
	type ChatAccount,
	createChatAccountFromMnemonic,
	createRandomChatAccount,
	validateMnemonic,
	validateAddress,
	type AlgorandConfig,
} from "@corvidlabs/ts-algochat";
import type { Provider, ProviderConfig, StreamCallbacks, ChatHistoryMessage, ToolDefinition } from "./providers";

// ─── Network helpers ───────────────────────────────────────────────

export type AlgoNetwork = "testnet" | "mainnet" | "localnet";

function buildServiceConfig(network: AlgoNetwork, localnetUrl?: string): AlgorandConfig {
	switch (network) {
		case "testnet":
			return {
				algodToken: "",
				algodServer: "https://testnet-api.4160.nodely.dev",
				indexerToken: "",
				indexerServer: "https://testnet-idx.4160.nodely.dev",
			};
		case "mainnet":
			return {
				algodToken: "",
				algodServer: "https://mainnet-api.4160.nodely.dev",
				indexerToken: "",
				indexerServer: "https://mainnet-idx.4160.nodely.dev",
			};
		case "localnet": {
			const base = (localnetUrl ?? "http://localhost:4001").replace(/\/$/, "");
			const indexerBase = base.replace(/:\d+$/, ":8980");
			return {
				algodToken: "a".repeat(64),
				algodServer: base,
				indexerToken: "a".repeat(64),
				indexerServer: indexerBase,
			};
		}
	}
}

// ─── AlgoChatProvider ─────────────────────────────────────────────

export interface AlgoChatConfig {
	mnemonic: string;
	network: AlgoNetwork;
	targetAddress: string;
	localnetUrl?: string;
}

export class AlgoChatProvider implements Provider {
	readonly type = "algochat" as const;
	readonly displayName = "AlgoChat";
	readonly supportsMemory = false;
	readonly supportsWorkTasks = false;
	readonly supportsTools = false;

	private config: ProviderConfig;
	private algoConfig: AlgoChatConfig;
	private service: AlgorandService | null = null;
	private chatAccount: ChatAccount | null = null;
	private aborted = false;

	constructor(config: ProviderConfig, algoConfig: AlgoChatConfig) {
		this.config = config;
		this.algoConfig = algoConfig;
		this.init();
	}

	private init(): void {
		if (!this.algoConfig.mnemonic) return;
		try {
			const svcConfig = buildServiceConfig(
				this.algoConfig.network,
				this.algoConfig.localnetUrl,
			);
			this.service = new AlgorandService(svcConfig as never);
			this.chatAccount = createChatAccountFromMnemonic(this.algoConfig.mnemonic);
		} catch {
			this.service = null;
			this.chatAccount = null;
		}
	}

	updateConfig(config: ProviderConfig): void {
		this.config = config;
	}

	updateAlgoConfig(algoConfig: AlgoChatConfig): void {
		this.algoConfig = algoConfig;
		this.init();
	}

	async testConnection(): Promise<void> {
		if (!this.algoConfig.mnemonic) throw new Error("No mnemonic configured");
		if (!this.algoConfig.targetAddress) throw new Error("No target address configured");
		if (!validateAddress(this.algoConfig.targetAddress)) {
			throw new Error("Invalid target Algorand address");
		}
		if (!this.service || !this.chatAccount) throw new Error("Failed to initialize AlgoChat");

		const balance = await this.service.getBalance(this.chatAccount.address);
		if (balance < BigInt(1000)) {
			throw new Error(
				`Insufficient balance (${Number(balance) / 1e6} ALGO). Fund ${this.chatAccount.address} with at least 0.001 ALGO.`,
			);
		}
	}

	async sendMessage(
		content: string,
		_history: ChatHistoryMessage[],
		callbacks: StreamCallbacks,
		_tools?: ToolDefinition[],
	): Promise<void> {
		this.aborted = false;

		if (!this.service || !this.chatAccount) {
			callbacks.onError("AlgoChat not initialized. Check your mnemonic in settings.");
			return;
		}

		if (!this.algoConfig.targetAddress) {
			callbacks.onError("No target address configured.");
			return;
		}

		try {
			// Discover recipient's encryption public key
			let recipientPubKey: Uint8Array;
			try {
				recipientPubKey = await this.service.discoverPublicKey(this.algoConfig.targetAddress);
			} catch {
				callbacks.onError(
					`Could not find encryption key for ${this.algoConfig.targetAddress}. ` +
					"The recipient must have announced their key on-chain first.",
				);
				return;
			}

			const sentAt = new Date();

			// Send the message
			await this.service.sendMessage(
				this.chatAccount,
				this.algoConfig.targetAddress,
				recipientPubKey,
				content,
				{ waitForConfirmation: false },
			);

			if (this.aborted) return;

			callbacks.onToken("_Message sent. Waiting for response..._\n\n");

			// Poll for response from target address
			const response = await this.pollForResponse(sentAt);
			if (this.aborted) return;

			if (response === null) {
				callbacks.onComplete("_(No response received within 60 seconds)_");
				return;
			}

			callbacks.onComplete(response);
		} catch (err: unknown) {
			if (this.aborted) return;
			callbacks.onError(err instanceof Error ? err.message : String(err));
		}
	}

	private async pollForResponse(sentAt: Date): Promise<string | null> {
		if (!this.service || !this.chatAccount) return null;

		const deadline = Date.now() + 60_000;
		const pollInterval = 5_000;

		while (Date.now() < deadline && !this.aborted) {
			await sleep(pollInterval);
			if (this.aborted) return null;

			try {
				const messages = await this.service.fetchMessages(
					this.chatAccount,
					this.algoConfig.targetAddress,
					undefined,
					20,
				);

				const received = messages.filter(
					(m) => m.direction === "received" && m.timestamp > sentAt,
				);
				if (received.length > 0) {
					return received.map((m) => m.content).join("\n\n");
				}
			} catch {
				// ignore transient fetch errors, keep polling
			}
		}

		return null;
	}

	abort(): void {
		this.aborted = true;
	}

	/** Get the wallet address for display */
	getAddress(): string | null {
		return this.chatAccount?.address ?? null;
	}

	/** Get the wallet balance in microALGO */
	async getBalance(): Promise<bigint | null> {
		if (!this.service || !this.chatAccount) return null;
		try {
			return await this.service.getBalance(this.chatAccount.address);
		} catch {
			return null;
		}
	}
}

// ─── Wallet helpers (used in settings UI) ────────────────────────

export { createRandomChatAccount, validateMnemonic, validateAddress };

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
