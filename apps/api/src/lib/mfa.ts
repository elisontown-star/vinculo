import { TOTP, Secret } from 'otpauth';

const ISSUER = 'Vínculo';

export function newSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function totpFor(secretBase32: string, label: string): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
}

export function otpauthUri(secretBase32: string, label: string): string {
  return totpFor(secretBase32, label).toString();
}

// Aceita janela de ±1 período (30s) para tolerar relógios levemente diferentes.
export function verifyTotp(secretBase32: string, token: string): boolean {
  const clean = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const delta = totpFor(secretBase32, 'user').validate({ token: clean, window: 1 });
  return delta !== null;
}

// ---- Códigos de recuperação ------------------------------------------------
function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
}

export function generateRecoveryCodes(n = 8): string[] {
  return Array.from({ length: n }, randomCode);
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => sha256(c)));
}

// Verifica um código de recuperação; retorna a lista de hashes restante (sem o usado) ou null.
export async function consumeRecoveryCode(
  input: string,
  storedHashes: string[],
): Promise<string[] | null> {
  const h = await sha256(input.replace(/\s+/g, '').toLowerCase());
  if (!storedHashes.includes(h)) return null;
  return storedHashes.filter((x) => x !== h);
}
