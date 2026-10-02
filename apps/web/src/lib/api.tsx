import { useAuth } from '@clerk/clerk-react';
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Decimal from 'decimal.js';

const apiBase = import.meta.env.VITE_API_URL || '/api';

export type Row = Record<string, any>;
export function useApi() {
  const { getToken } = useAuth();
  return useCallback(
    async <T,>(path: string, method = 'GET', data?: unknown, key?: string): Promise<T> => {
      const request = async (skipCache = false) => {
        const token = await getToken(skipCache ? { skipCache: true } : undefined);
        if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15000);
        try {
          return await fetch(`${apiBase}${path}`, {
            method,
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${token}`,
              ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
              ...(key ? { 'Idempotency-Key': key } : {}),
            },
            body: data !== undefined ? JSON.stringify(data) : undefined,
          });
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error(
              'O servidor demorou para responder. Verifique a internet e tente novamente.',
            );
          }
          throw error;
        } finally {
          window.clearTimeout(timeout);
        }
      };
      let response = await request();
      if (response.status === 401) response = await request(true);
      const payload = await response
        .json()
        .catch(() => ({ message: 'Resposta inesperada do servidor.' }));
      if (!response.ok) throw new Error(payload.message || 'Não foi possível concluir a operação.');
      return payload;
    },
    [getToken],
  );
}
export function useData<T = Row[]>(path: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: [path], queryFn: () => api<T>(path), retry: 1, enabled });
}
export function useSave() {
  const api = useApi(),
    client = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      method = 'POST',
      data,
      key,
    }: {
      path: string;
      method?: string;
      data?: unknown;
      key?: string;
    }) => api(path, method, data, key),
    onSuccess: () => client.invalidateQueries(),
    retry: false,
  });
}
Decimal.set({ precision: 40 });
export const euro = (value: string | number | undefined | null) => {
  const amount = new Decimal(value || 0),
    [whole, fraction] = amount.abs().toFixed(2).split('.');
  const parts = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).formatToParts(BigInt(whole));
  return (
    (amount.lt(0) ? '−' : '') +
    parts.map((p) => (p.type === 'fraction' ? fraction : p.value)).join('')
  );
};
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(value + 'T12:00:00'),
  );
export const currentDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
