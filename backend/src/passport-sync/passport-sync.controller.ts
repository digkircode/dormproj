import {
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { SyncAlreadyRunningError } from '../sync/sync.errors';
import {
  PassportSyncService,
  type PassportSyncResult,
} from './passport-sync.service';

@Controller('sync/passport')
@UseGuards(AuthGuard)
export class PassportSyncController {
  constructor(private readonly syncService: PassportSyncService) {}

  @Post()
  @HttpCode(200)
  async trigger(): Promise<PassportSyncResult> {
    try {
      return await this.syncService.runSync('MANUAL');
    } catch (error) {
      if (error instanceof SyncAlreadyRunningError) {
        throw new ConflictException(
          'Синхронизация уже выполняется, дождитесь её завершения',
        );
      }
      throw error;
    }
  }

  @Get('logs')
  async logs() {
    return this.syncService.getRecentLogs();
  }
}
