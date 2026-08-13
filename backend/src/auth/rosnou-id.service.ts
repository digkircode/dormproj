import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { Env } from '../config/env.schema';
import { ROSNOU_ID_SCOPE } from './auth.constants';
import type { RosnouIdUser } from './types';

const REQUEST_TIMEOUT_MS = 15_000;

interface TokenResponse {
  access_token: string;
}

@Injectable()
export class RosnouIdService {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get('ROSNOU_ID_CLIENT_ID', { infer: true }),
      redirect_uri: this.config.get('ROSNOU_ID_REDIRECT_URI', { infer: true }),
      response_type: 'code',
      scope: ROSNOU_ID_SCOPE,
      state,
    });
    return `${this.config.get('ROSNOU_ID_BASE_URL', { infer: true })}/oauth/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.get('ROSNOU_ID_CLIENT_ID', { infer: true }),
      client_secret: this.config.get('ROSNOU_ID_CLIENT_SECRET', { infer: true }),
      redirect_uri: this.config.get('ROSNOU_ID_REDIRECT_URI', { infer: true }),
      code,
    });
    const response = await firstValueFrom(
      this.http.post<TokenResponse>(
        `${this.config.get('ROSNOU_ID_BASE_URL', { infer: true })}/oauth/token`,
        body.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: REQUEST_TIMEOUT_MS,
        },
      ),
    );
    return response.data.access_token;
  }

  async fetchUser(accessToken: string): Promise<RosnouIdUser> {
    const response = await firstValueFrom(
      this.http.get<RosnouIdUser>(`${this.config.get('ROSNOU_ID_BASE_URL', { infer: true })}/api/user`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: REQUEST_TIMEOUT_MS,
      }),
    );
    return response.data;
  }
}
