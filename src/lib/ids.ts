const ID_ALPHABET = "0123456789abcdefghijkmnpqrstuvwxyz"; // 34 chars, no l/o
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 31 chars, unambiguous

function randomString(alphabet: string, length: number): string {
  // Rejection sampling avoids modulo bias.
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let out = "";
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < limit) out += alphabet[b % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/** Unguessable record id (~71 bits). */
export const newId = () => randomString(ID_ALPHABET, 14);

/** Human-friendly invite code (~49 bits). */
export const newInviteCode = () => randomString(CODE_ALPHABET, 10);

/** Session token (~160 bits). */
export const newSessionToken = () => randomString(ID_ALPHABET, 32);
