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
import { SyncAlreadyRunningError } from '../sync/sync.errors';
import {
  IndividualsSyncService,
  type IndividualsSyncResult,
} from './individuals-sync.service';

@Controller('sync/individuals')
@UseGuards(AuthGuard)
export class IndividualsSyncController {
  constructor(private readonly syncService: IndividualsSyncService) {}

  @Post()
  @HttpCode(200)
  async trigger(): Promise<IndividualsSyncResult> {
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
