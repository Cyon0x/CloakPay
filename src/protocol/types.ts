export type Field = bigint;

export interface Note {
  version: 1;
  chainId: number;
  denominationId: string;
  /** Value in wei. Constant per denomination; kept for display and checks. */
  amountWei: bigint;
  nullifier: Field;
  secret: Field;
  commitment: Field;
  nullifierHash: Field;
}

export interface MerkleProof {
  root: Field;
  leafIndex: number;
  pathElements: Field[];
  pathIndices: number[];
}

export interface NoteEnvelope {
  v: 1;
  alg: "P256-HKDF-SHA256-AES-256-GCM";
  /** Compressed ephemeral public key, base64url. */
  epk: string;
  /** 12-byte AES-GCM nonce, base64url. */
  iv: string;
  /** Ciphertext with the 16-byte GCM tag appended, base64url. */
  ct: string;
}

export interface KeyEnvelope {
  v: 1;
  alg: "PBKDF2-SHA256-600000-AES-256-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  /** 16-byte salt, base64url. */
  salt: string;
  iv: string;
  ct: string;
}
