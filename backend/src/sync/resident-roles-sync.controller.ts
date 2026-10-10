import { ConflictException, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SyncAlreadyRunningError } from './sync.errors';
import { ResidentRolesSyncService } from './resident-roles-sync.service';

@Controller('sync/resident-roles')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class ResidentRolesSyncController {
  constructor(private readonly sync: ResidentRolesSyncService) {}

  @Post()
  @HttpCode(200)
  async trigger() {
    try {
      return await this.sync.runSync('MANUAL');
    } catch (error) {
      if (error instanceof SyncAlreadyRunningError) throw new ConflictException('sync.errors.alreadyRunning');
      throw error;
    }
  }
}
