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
  CitizenshipSyncService,
  type CitizenshipSyncResult,
} from './citizenship-sync.service';

@Controller('sync/citizenship')
@UseGuards(AuthGuard)
export class CitizenshipSyncController {
  constructor(private readonly syncService: CitizenshipSyncService) {}

  @Post()
  @HttpCode(200)
  async trigger(): Promise<CitizenshipSyncResult> {
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
