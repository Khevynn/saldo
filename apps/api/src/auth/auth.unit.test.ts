import { describe, expect, it } from 'vitest';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { clerkJwtKey } from './auth';

describe('clerkJwtKey', () => {
  it('mantém uma chave PEM e converte quebras escapadas', () => {
    expect(clerkJwtKey('-----BEGIN PUBLIC KEY-----\\nabc\\n-----END PUBLIC KEY-----')).toBe(
      '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----',
    );
  });

  it('envolve uma chave RSA Base64 no formato PEM', () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const raw = pem.replace(/-----[^-]+-----|\s/g, '');
    expect(() => createPublicKey(clerkJwtKey(raw))).not.toThrow();
  });

  it('não configura uma chave vazia', () => {
    expect(clerkJwtKey('')).toBeUndefined();
  });
});
