import {
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Post,
} from '@nestjs/common';
import { SyncService, type SyncResult } from './sync.service';
import { SyncAlreadyRunningError } from './sync.errors';

@Controller('sync/students')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  // Пока синхронизация выполняется, повторный вызов получает 409 вместо того, чтобы
  // встать в очередь или запуститься параллельно — фронту этого достаточно, чтобы
  // держать кнопку задизейбленной со спиннером до завершения текущего запуска.
  @Post()
  @HttpCode(200)
  async trigger(): Promise<SyncResult> {
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
