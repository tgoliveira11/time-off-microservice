import { Controller, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { BatchImportService } from './batch-import.service';
import { ReconciliationService } from './reconciliation.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { UserRole } from '../../domain/enums';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth.types';

@ApiTags('system')
@Controller('system')
@UseGuards(AuthGuard)
@Roles(UserRole.SYSTEM_INTEGRATION, UserRole.SYSTEM_ADMIN)
export class SystemController {
  constructor(
    private readonly batchImportService: BatchImportService,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  @Post('hcm/balances/batch-import')
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  batchImport(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.batchImportService.runBatchImport(user, idempotencyKey);
  }

  @Post('reconciliation/run')
  @HttpCode(HttpStatus.OK)
  reconciliation() {
    return this.reconciliationService.runReconciliation();
  }
}
