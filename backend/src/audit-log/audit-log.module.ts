import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

// Global — тот же приём, что и PrismaModule: AuditLogService нужен во множестве
// не связанных друг с другом контроллеров (contracts/individuals/rooms/billing/users/
// roles), импортировать его в каждый feature-модуль отдельно было бы лишним шумом.
// AuthModule — AuditLogController сам под AuthGuard/RolesGuard (см. другие admin-разделы),
// а AuthGuard зависит от SessionService, который живёт в AuthModule.
@Global()
@Module({
  imports: [AuthModule],
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
