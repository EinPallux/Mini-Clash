/**
 * Lobby code → roomId lookup (single-process registry; the v0.7 platform api
 * moves this into Postgres when servers scale out). Codes use an unambiguous
 * alphabet (no 0/O/1/I/L) so they survive being read out loud.
 */

const codes = new Map<string, string>();

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function issueLobbyCode(roomId: string): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!codes.has(code)) {
      codes.set(code, roomId);
      return code;
    }
  }
  throw new Error('lobby code space exhausted');
}

export function lookupLobby(code: string): string | null {
  return codes.get(code.toUpperCase()) ?? null;
}

export function releaseLobbyCode(code: string): void {
  codes.delete(code);
}
