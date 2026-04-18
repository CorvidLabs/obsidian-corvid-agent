export interface EncryptedMnemonic {
	ciphertext: string;
	salt: string;
	iv: string;
}

export async function encryptMnemonic(
	mnemonic: string,
	password: string,
): Promise<EncryptedMnemonic> {
	const enc = new TextEncoder();
	const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>;
	const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;

	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		enc.encode(password),
		"PBKDF2",
		false,
		["deriveKey"],
	);
	const key = await crypto.subtle.deriveKey(
		{ name: "PBKDF2", salt, iterations: 250_000, hash: "SHA-256" },
		keyMaterial,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt"],
	);

	const ciphertextBuf = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		enc.encode(mnemonic),
	);

	return {
		ciphertext: toBase64(new Uint8Array(ciphertextBuf)),
		salt: toBase64(salt),
		iv: toBase64(iv),
	};
}

export async function decryptMnemonic(
	encrypted: EncryptedMnemonic,
	password: string,
): Promise<string> {
	const enc = new TextEncoder();
	const dec = new TextDecoder();
	const salt = fromBase64(encrypted.salt).buffer as ArrayBuffer;
	const iv = fromBase64(encrypted.iv).buffer as ArrayBuffer;
	const ciphertext = fromBase64(encrypted.ciphertext).buffer as ArrayBuffer;

	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		enc.encode(password),
		"PBKDF2",
		false,
		["deriveKey"],
	);
	const key = await crypto.subtle.deriveKey(
		{ name: "PBKDF2", salt, iterations: 250_000, hash: "SHA-256" },
		keyMaterial,
		{ name: "AES-GCM", length: 256 },
		false,
		["decrypt"],
	);

	const plaintextBuf = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv },
		key,
		ciphertext,
	);
	return dec.decode(plaintextBuf);
}

function toBase64(buf: Uint8Array): string {
	return btoa(String.fromCharCode(...buf));
}

function fromBase64(b64: string): Uint8Array {
	return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
