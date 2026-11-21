import type { Chapter, Preferences, SessionSummary, Stats, Subject } from '@sillage/shared';
export interface User {
  id: string;
  name: string;
  email: string;
  csrf: string;
  preferences: Preferences;
}
export interface SubjectDetail extends Subject {
  chapters: Chapter[];
}
export interface ChapterDetail extends Chapter {
  subject: { id: string; name: string; color: string };
}
export interface Overview {
  subjects: SubjectDetail[];
  stats: Stats;
  today: string;
  notions: { name: string; stats: Stats }[];
  recent: SessionSummary[];
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
let csrf = '';
export const setCsrf = (value: string) => {
  csrf = value;
};
export const apiUrl = (path: string) => (import.meta.env.VITE_API_URL ?? '') + '/api' + path;
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(
      'Connexion interrompue. Vos données saisies sont conservées ; réessayez.',
      0,
      'NETWORK',
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('sillage:unauthorized'));
    throw new ApiError(
      data.error?.message ?? 'Le serveur est momentanément indisponible.',
      response.status,
      data.error?.code ?? 'HTTP',
      data.error?.details,
    );
  }
  return data as T;
}
export const shortDate = (value: string) =>
  new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
export const duration = (seconds: number | null) =>
  seconds === null
    ? '—'
    : seconds < 60
      ? `${seconds} s`
      : `${Math.floor(seconds / 60)} min ${seconds % 60 ? `${seconds % 60} s` : ''}`;
