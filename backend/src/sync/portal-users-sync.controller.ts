import { ConflictException, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SyncAlreadyRunningError } from './sync.errors';
import { PortalUsersSyncService } from './portal-users-sync.service';

@Controller('sync/portal-users')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class PortalUsersSyncController {
  constructor(private readonly sync: PortalUsersSyncService) {}

  @Post()
  @HttpCode(202)
  async trigger() {
    try {
      return await this.sync.startManual();
    } catch (error) {
      if (error instanceof SyncAlreadyRunningError) throw new ConflictException('sync.errors.alreadyRunning');
      throw error;
    }
  }

  @Get('logs')
  logs(@Query() query: Record<string, string>) { return this.sync.listLogs(query); }

  @Get('logs/facets/:field')
  facets(@Param('field') field: string) { return this.sync.logFacetValues(field); }
}
