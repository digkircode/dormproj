import {
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SyncAlreadyRunningError } from '../sync/sync.errors';
import {
  ContactInfoSyncService,
  type ContactInfoSyncResult,
} from './contact-info-sync.service';

@Controller('sync/contact-info')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class ContactInfoSyncController {
  constructor(private readonly syncService: ContactInfoSyncService) {}

  @Post()
  @HttpCode(200)
  async trigger(): Promise<ContactInfoSyncResult> {
    try {
      return await this.syncService.runSync('MANUAL');
    } catch (error) {
      if (error instanceof SyncAlreadyRunningError) {
        throw new ConflictException('sync.errors.alreadyRunning');
      }
      throw error;
    }
  }

  @Get('logs')
  async logs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
    @Query('filters') filters?: string,
  ) {
    return this.syncService.listLogs({ page, pageSize, search, sortBy, sortDir, filters });
  }

  @Get('logs/facets/:field')
  async logsFacets(@Param('field') field: string) {
    return this.syncService.logFacetValues(field);
  }
}
