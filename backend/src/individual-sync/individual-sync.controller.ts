import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { IndividualSyncService } from './individual-sync.service';

// Только логи — никакого POST-триггера здесь намеренно нет. Единственный способ
// запустить этот синхрон — POST /individuals/:uid/sync с карточки физлица
// (см. IndividualsController), не общий запуск/крон, как у остальных 5 типов.
@Controller('sync/individual')
@UseGuards(AuthGuard)
export class IndividualSyncController {
  constructor(private readonly syncService: IndividualSyncService) {}

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
