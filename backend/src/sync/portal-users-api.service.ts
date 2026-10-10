import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as delay } from 'node:timers/promises';
import type { Env } from '../config/env.schema';

const PRODUCTION_USERS_URL = 'https://api.rosnou.ru/v1/users';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_PAGES = 1_000;

export interface PortalUserRecord {
  id: number;
  fullName: string;
  email: string | null;
  azureId: string | null;
  univerId: string | null;
}

function optionalId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id: unknown = (value as Record<string, unknown>).id;
  return (typeof id === 'string' || typeof id === 'number') && String(id).trim()
    ? String(id).trim() : null;
}

function parseUser(value: unknown): PortalUserRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Некорректная запись пользователя портала');
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id <= 0) {
    throw new Error('Некорректный ID пользователя портала');
  }
  const name = [row.surname, row.name, row.patronymic]
    .filter((part): part is string => typeof part === 'string' && Boolean(part.trim()))
    .map((part) => part.trim()).join(' ');
  return {
    id: row.id,
    fullName: name || `Пользователь ${row.id}`,
    email: typeof row.email === 'string' && row.email.trim() ? row.email.trim() : null,
    azureId: optionalId(row.azure),
    univerId: optionalId(row.university),
  };
}

@Injectable()
export class PortalUsersApiService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private usersUrl(): string | undefined {
    const explicit = this.config.get('PORTAL_API_USERS_URL', { infer: true });
    if (explicit) return explicit;
    const base = this.config.get('PORTAL_API_BASE_URL', { infer: true });
    return base && new URL(base).hostname === 'portal.rosnou.ru' ? PRODUCTION_USERS_URL : undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.config.get('PORTAL_API_BASE_URL', { infer: true })
      && this.config.get('PORTAL_API_CLIENT_ID', { infer: true })
      && this.config.get('PORTAL_API_CLIENT_SECRET', { infer: true })
      && this.usersUrl());
  }

  private async token(): Promise<string> {
    const base = this.config.get('PORTAL_API_BASE_URL', { infer: true });
    const clientId = this.config.get('PORTAL_API_CLIENT_ID', { infer: true });
    const clientSecret = this.config.get('PORTAL_API_CLIENT_SECRET', { infer: true });
    if (!base || !clientId || !clientSecret) throw new Error('Доступ к API портала не настроен');
    const response = await fetch(`${base.replace(/\/$/, '')}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Портал не выдал токен: HTTP ${response.status}`);
    const body: unknown = await response.json();
    const token = body && typeof body === 'object' && 'access_token' in body ? (body as { access_token: unknown }).access_token : null;
    if (typeof token !== 'string' || !token) throw new Error('Портал вернул ответ без access_token');
    return token;
  }

  async fetchAll(): Promise<PortalUserRecord[]> {
    const token = await this.token();
    const usersUrl = this.usersUrl();
    if (!usersUrl) throw new Error('Адрес списка пользователей портала не настроен');
    const users: PortalUserRecord[] = [];
    const seenIds = new Set<number>();
    let expectedTotal: number | null = null;
    for (let page = 1; page <= MAX_PAGES; page++) {
      if (page > 1) await delay(1_100); // API портала ограничен 60 запросами в минуту.
      const url = new URL(usersUrl);
      url.searchParams.set('page', String(page));
      const response = await fetch(url, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Не удалось прочитать пользователей портала: HTTP ${response.status}, страница ${page}`);
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || !('data' in body) || !Array.isArray(body.data)) {
        throw new Error(`Некорректный ответ пользователей портала, страница ${page}`);
      }
      const payload = body as { data: unknown[]; meta?: { pagination?: { total?: number; total_pages?: number } } };
      const total = payload.meta?.pagination?.total;
      if (typeof total === 'number' && Number.isSafeInteger(total)) expectedTotal = total;
      for (const raw of payload.data) {
        const user = parseUser(raw);
        if (seenIds.has(user.id)) throw new Error(`Повтор ID пользователя портала на странице ${page}`);
        seenIds.add(user.id);
        users.push(user);
      }
      const totalPages = payload.meta?.pagination?.total_pages;
      if (typeof totalPages === 'number' && page >= totalPages) break;
      if (payload.data.length === 0) break;
      if (page === MAX_PAGES) throw new Error('Превышен лимит страниц API портала');
    }
    if (expectedTotal !== null && users.length !== expectedTotal) {
      throw new Error(`Портал вернул неполный список пользователей: ${users.length} из ${expectedTotal}`);
    }
    if (users.length === 0) throw new Error('Портал вернул пустой список пользователей');
    return users;
  }
}
