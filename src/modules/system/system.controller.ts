import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { BatchImportService } from './batch-import.service';
import { ReconciliationService } from './reconciliation.service';
import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { UserRole } from '../../domain/enums';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { AuthUser } from '../../common/auth/auth.types';
import { ApiAuthHeaders } from '../../common/swagger/api-auth.decorator';
import { IdempotencyKey } from '../../common/http/idempotency-key.decorator';
import { ErrorResponseDto } from '../../common/swagger/dto/error-response.dto';
import {
  BatchImportResponseDto,
  ReconciliationResponseDto,
} from '../../common/swagger/dto/system-response.dto';

@ApiTags('system')
@Controller('system')
@UseGuards(AuthGuard)
@Roles(UserRole.SYSTEM_INTEGRATION, UserRole.SYSTEM_ADMIN)
@ApiAuthHeaders()
export class SystemController {
  constructor(
    private readonly batchImportService: BatchImportService,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  @Post('hcm/balances/batch-import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Import HCM batch balance corpus and reconcile local balances' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOkResponse({ type: BatchImportResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  batchImport(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey?: string,
  ) {
    return this.batchImportService.runBatchImport(user, idempotencyKey);
  }

  @Post('reconciliation/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run reconciliation between local balances and HCM' })
  @ApiOkResponse({ type: ReconciliationResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: ErrorResponseDto })
  reconciliation() {
    return this.reconciliationService.runReconciliation();
  }
}
