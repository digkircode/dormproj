import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../config/env.schema';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { RosnouIdService } from './rosnou-id.service';
import { SessionService } from './session.service';

@Module({
  imports: [
    HttpModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('SESSION_SECRET', { infer: true }),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [RosnouIdService, SessionService, AuthGuard],
  exports: [AuthGuard, SessionService],
})
export class AuthModule {}
