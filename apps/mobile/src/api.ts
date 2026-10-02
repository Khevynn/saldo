import Constants from 'expo-constants';
import { useAuth } from '@clerk/expo';
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type Row = Record<string, any>;

const apiBase = String(
  Constants.expoConfig?.extra?.apiUrl ||
    process.env.EXPO_PUBLIC_API_URL ||
    'https://saldo.bdpserver.online/api',
).replace(/\/$/, '');

export function useApi() {
  const { getToken } = useAuth();
  return useCallback(
    async <T>(path: string, method = 'GET', data?: unknown, idempotencyKey?: string) => {
      const execute = async (skipCache = false) => {
        const token = await getToken(skipCache ? { skipCache: true } : undefined);
        if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
          return await fetch(`${apiBase}${path}`, {
            method,
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${token}`,
              ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
              ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
            },
            body: data === undefined ? undefined : JSON.stringify(data),
          });
        } finally {
          clearTimeout(timer);
        }
      };

      let response: Response;
      try {
        response = await execute();
        if (response.status === 401) response = await execute(true);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('O servidor demorou para responder. Verifique a internet.');
        }
        throw error;
      }
      const payload = await response.json().catch(() => ({ message: 'Resposta inesperada.' }));
      if (!response.ok) throw new Error(payload.message || 'Não foi possível concluir a operação.');
      return payload as T;
    },
    [getToken],
  );
}

export function useData<T = Row[]>(path: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: [path], queryFn: () => api<T>(path), enabled, retry: 1 });
}

export function useSave() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      path: string;
      method?: string;
      data?: unknown;
      idempotencyKey?: string;
    }) => api(input.path, input.method || 'POST', input.data, input.idempotencyKey),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export const currentDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

export const euro = (value: unknown) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));

export const dateLabel = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('pt-PT', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(`${value.slice(0, 10)}T12:00:00`))
    : '—';

export const monthLabel = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(
        new Date(`${value.slice(0, 7)}-15T12:00:00`),
      )
    : '—';

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
