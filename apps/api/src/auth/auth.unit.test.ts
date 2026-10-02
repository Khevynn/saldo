import { describe, expect, it } from 'vitest';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { clerkJwtKey, validClerkSessionClaims } from './auth';

describe('clerkJwtKey', () => {
  it('mantém uma chave PEM e converte quebras escapadas', () => {
    expect(clerkJwtKey('-----BEGIN PUBLIC KEY-----\\nabc\\n-----END PUBLIC KEY-----')).toBe(
      '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----',
    );
  });

  it('envolve uma chave RSA Base64 no formato PEM', () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const raw = pem.replace(/-----[^-]+-----|\s/g, '');
    expect(() => createPublicKey(clerkJwtKey(raw))).not.toThrow();
  });

  it('não configura uma chave vazia', () => {
    expect(clerkJwtKey('')).toBeUndefined();
  });
});

describe('validClerkSessionClaims', () => {
  const parties = ['https://saldo.example', 'https://mobile.saldo.example'];

  it('aceita sessão nativa assinada sem origem de navegador', () => {
    expect(validClerkSessionClaims({ sub: 'user_1', sid: 'sess_1' }, parties)).toBe(true);
  });

  it('continua validando a origem quando azp está presente', () => {
    expect(
      validClerkSessionClaims(
        { sub: 'user_1', sid: 'sess_1', azp: 'https://mobile.saldo.example' },
        parties,
      ),
    ).toBe(true);
    expect(
      validClerkSessionClaims(
        { sub: 'user_1', sid: 'sess_1', azp: 'https://malicioso.example' },
        parties,
      ),
    ).toBe(false);
  });

  it('rejeita sessão sem usuário ou sem identificador de sessão', () => {
    expect(validClerkSessionClaims({ sid: 'sess_1' }, parties)).toBe(false);
    expect(validClerkSessionClaims({ sub: 'user_1' }, parties)).toBe(false);
  });
});
