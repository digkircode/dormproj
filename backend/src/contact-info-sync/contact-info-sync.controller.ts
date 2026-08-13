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
  ContactInfoSyncService,
  type ContactInfoSyncResult,
} from './contact-info-sync.service';

@Controller('sync/contact-info')
@UseGuards(AuthGuard)
export class ContactInfoSyncController {
  constructor(private readonly syncService: ContactInfoSyncService) {}

  @Post()
  @HttpCode(200)
  async trigger(): Promise<ContactInfoSyncResult> {
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
