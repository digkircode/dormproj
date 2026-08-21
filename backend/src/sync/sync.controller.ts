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
import { SyncService, type SyncResult } from './sync.service';
import { SyncAlreadyRunningError } from './sync.errors';

@Controller('sync/students')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
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
