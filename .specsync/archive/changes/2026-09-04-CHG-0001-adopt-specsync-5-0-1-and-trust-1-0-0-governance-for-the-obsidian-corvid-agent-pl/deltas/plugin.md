# Obsidian Corvid Agent current-contract semantic delta

## MODIFIED

### REQUIREMENT REQ-plugin-012
The bundled runtime dependency SHALL remain limited to `@corvidlabs/ts-algochat`; Obsidian APIs SHALL remain external and provider HTTP streaming SHALL continue to use the implemented Obsidian or browser request surfaces.

Acceptance Criteria
- The package manifest declares no additional runtime dependency and the production plugin bundle compiles the current provider paths.

## ADDED

### REQUIREMENT REQ-plugin-013
The AlgoChat provider SHALL support testnet, mainnet, and localnet; validate configured credentials and the target address; discover the recipient encryption key; send an encrypted message; and poll for newer received responses with abort and timeout handling.

Acceptance Criteria
- Production compilation covers all network, validation, send, response-filter, timeout, and abort paths without claiming a live chain execution.

### REQUIREMENT REQ-plugin-014
AlgoChat mnemonic persistence SHALL use PBKDF2-SHA-256 with 250,000 iterations and per-encryption random salt to derive an AES-256-GCM key with a random IV. Decryption SHALL authenticate the ciphertext before returning plaintext.

Acceptance Criteria
- The encrypted shape persists Base64 ciphertext, salt, and IV while wrong credentials or altered ciphertext reject during AES-GCM decryption.

### REQUIREMENT REQ-plugin-015
The AlgoChat settings surface SHALL create or import an account, keep the stored mnemonic encrypted, expose the derived address and balance, validate recipient addresses, and require explicit operator action to publish the encryption key or send messages.

Acceptance Criteria
- Production compilation covers encrypted wallet settings and explicit publish/send controls without running a wallet or chain mutation.
