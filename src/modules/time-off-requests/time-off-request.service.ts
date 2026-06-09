import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BalanceUpdateConflictError } from '../../database/repositories/balance.repository';
import { RequestTransitionConflictError } from '../../database/repositories/time-off-request.repository';
import {
  BALANCE_REPOSITORY,
  BalanceRepositoryPort,
  EMPLOYEE_REPOSITORY,
  EmployeeRepositoryPort,
  LOCATION_REPOSITORY,
  LocationRepositoryPort,
  OUTBOX_REPOSITORY,
  OutboxRepositoryPort,
  REQUEST_STATUS_HISTORY_REPOSITORY,
  RequestStatusHistoryRepositoryPort,
  TIME_OFF_REQUEST_REPOSITORY,
  TimeOffRequestRepositoryPort,
} from '../../database/ports/repository.ports';
import {
  TRANSACTION_MANAGER,
  TransactionManagerPort,
} from '../../database/ports/transaction-manager.port';
import { AuditService } from '../../common/audit/audit.service';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import {
  buildApproveRequestScope,
  buildCancelRequestScope,
  buildCreateRequestScope,
  buildRejectRequestScope,
  hashCreateRequestPayload,
} from '../../common/idempotency/idempotency-scope.util';
import {
  OperationAcceptedException,
  OperationOkException,
} from '../../common/http/operation-http.exceptions';
import { HcmClientService } from '../hcm/hcm-client.service';
import { BalanceCalculatorService } from '../../domain/balance-calculator.service';
import { StateTransitionService } from '../../domain/state-transition.service';
import { RequestValidationService } from '../../domain/request-validation.service';
import {
  ActorType,
  BalanceUnit,
  RequestStatus,
  UserRole,
} from '../../domain/enums';
import { AuthUser } from '../../common/auth/auth.types';
import {
  HcmClientError,
  HcmErrorType,
} from '../../domain/hcm-error-mapper.service';
import { InsufficientBalanceError } from '../../domain/balance-calculator.service';
import { MetricsService } from '../../common/observability/metrics.service';
import { StructuredEventLogger } from '../../common/observability/structured-event-logger.service';

@Injectable()
export class TimeOffRequestService {
  constructor(
    @Inject(TRANSACTION_MANAGER)
    private readonly transactionManager: TransactionManagerPort,
    @Inject(BALANCE_REPOSITORY)
    private readonly balanceRepository: BalanceRepositoryPort,
    @Inject(EMPLOYEE_REPOSITORY)
    private readonly employeeRepository: EmployeeRepositoryPort,
    @Inject(LOCATION_REPOSITORY)
    private readonly locationRepository: LocationRepositoryPort,
    @Inject(TIME_OFF_REQUEST_REPOSITORY)
    private readonly requestRepository: TimeOffRequestRepositoryPort,
    @Inject(REQUEST_STATUS_HISTORY_REPOSITORY)
    private readonly statusHistoryRepository: RequestStatusHistoryRepositoryPort,
    @Inject(OUTBOX_REPOSITORY)
    private readonly outboxRepository: OutboxRepositoryPort,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
    private readonly hcmClientService: HcmClientService,
    private readonly balanceCalculator: BalanceCalculatorService,
    private readonly stateTransitionService: StateTransitionService,
    private readonly requestValidationService: RequestValidationService,
    private readonly metricsService: MetricsService,
    private readonly eventLogger: StructuredEventLogger,
  ) {}

  createRequest(
    user: AuthUser,
    dto: {
      employeeId: string;
      locationId: string;
      amount: number;
      unit: BalanceUnit;
      startDate: string;
      endDate: string;
    },
    idempotencyKey?: string,
  ) {
    if (user.role === UserRole.EMPLOYEE && user.id !== dto.employeeId) {
      throw new ForbiddenException('Cannot create request for another employee');
    }

    if (idempotencyKey) {
      const scope = buildCreateRequestScope(
        dto.employeeId,
        idempotencyKey,
        dto,
      );
      const cached = this.idempotencyService.getCached<{
        requestId: string;
        status: RequestStatus;
        availableBalanceAfterReservation: number;
      }>(scope, idempotencyKey);
      if (cached) {
        this.metricsService.increment('idempotencyReplayTotal');
        this.eventLogger.emit({
          event: 'idempotency.replay',
          employeeId: dto.employeeId,
          locationId: dto.locationId,
        });
        throw new OperationOkException(cached);
      }
    }

    const existing = idempotencyKey
      ? this.requestRepository.findByIdempotencyKey(
          dto.employeeId,
          idempotencyKey,
        )
      : null;
    if (existing) {
      this.assertMatchingCreatePayload(existing, dto);
      const balance = this.balanceRepository.findByEmployeeAndLocation(
        dto.employeeId,
        dto.locationId,
      );
      const result = {
        requestId: existing.id,
        status: existing.status,
        availableBalanceAfterReservation: balance?.availableBalance ?? 0,
      };
      this.saveCreateIdempotency(dto, idempotencyKey, result);
      throw new OperationOkException(result);
    }

    this.requestValidationService.validateAmount(dto.amount);
    this.requestValidationService.validateDates(dto.startDate, dto.endDate);

    const employee = this.employeeRepository.findById(dto.employeeId);
    const location = this.locationRepository.findById(dto.locationId);
    if (!employee || !location) {
      throw new UnprocessableEntityException('Invalid employee/location');
    }

    try {
      const result = this.transactionManager.runInTransaction(() => {
        const updatedBalance = this.balanceRepository.reserveBalanceIfAvailable(
          dto.employeeId,
          dto.locationId,
          dto.amount,
        );

        const request = this.requestRepository.create({
          employeeId: dto.employeeId,
          locationId: dto.locationId,
          amount: dto.amount,
          unit: dto.unit,
          startDate: dto.startDate,
          endDate: dto.endDate,
          status: RequestStatus.PENDING_MANAGER_APPROVAL,
          managerId: employee.managerId,
          idempotencyKey: idempotencyKey ?? null,
        });

        this.statusHistoryRepository.create({
          requestId: request.id,
          fromStatus: null,
          toStatus: RequestStatus.PENDING_MANAGER_APPROVAL,
          actorType: ActorType.EMPLOYEE,
          actorId: user.id,
        });

        this.auditService.log({
          entityType: 'TIME_OFF_REQUEST',
          entityId: request.id,
          action: 'REQUEST_CREATED',
          actorType: ActorType.EMPLOYEE,
          actorId: user.id,
          metadata: { amount: dto.amount, locationId: dto.locationId },
        });

        this.outboxRepository.create({
          aggregateType: 'TIME_OFF_REQUEST',
          aggregateId: request.id,
          eventType: 'REQUEST_CREATED',
          payload: { requestId: request.id, amount: dto.amount },
        });

        return {
          requestId: request.id,
          status: request.status,
          availableBalanceAfterReservation: updatedBalance.availableBalance,
        };
      });

      this.saveCreateIdempotency(dto, idempotencyKey, result);
      this.metricsService.increment('requestsCreatedTotal');
      this.eventLogger.emit({
        event: 'request.created',
        requestId: result.requestId,
        employeeId: dto.employeeId,
        locationId: dto.locationId,
      });
      this.eventLogger.emit({
        event: 'balance.reserved',
        requestId: result.requestId,
        employeeId: dto.employeeId,
        locationId: dto.locationId,
      });
      throw new OperationOkException(result);
    } catch (error) {
      if (error instanceof BalanceUpdateConflictError) {
        throw new ConflictException('Insufficient local balance');
      }
      if (error instanceof InsufficientBalanceError) {
        throw new ConflictException('Insufficient local balance');
      }
      throw error;
    }
  }

  getRequest(requestId: string, user: AuthUser) {
    const request = this.requestRepository.findById(requestId);
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    this.assertCanViewRequest(request.employeeId, user);

    const history = this.statusHistoryRepository.findByRequestId(requestId);
    return { ...request, statusHistory: history };
  }

  cancelRequest(requestId: string, user: AuthUser, idempotencyKey?: string) {
    const request = this.requestRepository.findById(requestId);
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    this.assertActorCanCancel(request, user);

    if (idempotencyKey) {
      const scope = buildCancelRequestScope(
        requestId,
        user.id,
        user.role,
        idempotencyKey,
      );
      const cached = this.idempotencyService.getCached<{ requestId: string; status: RequestStatus }>(
        scope,
        idempotencyKey,
      );
      if (cached) {
        throw new OperationOkException(cached);
      }
    }

    if (!this.stateTransitionService.canCancel(request.status)) {
      throw new UnprocessableEntityException('Request cannot be cancelled');
    }

    try {
      const result = this.transactionManager.runInTransaction(() => {
        const current = this.requestRepository.findById(requestId)!;

        if (
          current.status === RequestStatus.SUBMITTED ||
          current.status === RequestStatus.PENDING_MANAGER_APPROVAL
        ) {
          this.requestRepository.transitionStatusIfIn(
            requestId,
            [RequestStatus.SUBMITTED, RequestStatus.PENDING_MANAGER_APPROVAL],
            RequestStatus.CANCELLED,
          );
          this.balanceRepository.releaseReservedBalance(
            current.employeeId,
            current.locationId,
            current.amount,
          );
        } else if (current.status === RequestStatus.APPROVED) {
          this.requestRepository.transitionStatus(
            requestId,
            RequestStatus.APPROVED,
            RequestStatus.CANCELLED,
          );
        } else {
          throw new UnprocessableEntityException('Request cannot be cancelled');
        }

        this.statusHistoryRepository.create({
          requestId,
          fromStatus: current.status,
          toStatus: RequestStatus.CANCELLED,
          actorType:
            user.role === UserRole.MANAGER
              ? ActorType.MANAGER
              : ActorType.EMPLOYEE,
          actorId: user.id,
        });

        this.auditService.log({
          entityType: 'TIME_OFF_REQUEST',
          entityId: requestId,
          action: 'REQUEST_CANCELLED',
          actorType:
            user.role === UserRole.MANAGER
              ? ActorType.MANAGER
              : ActorType.EMPLOYEE,
          actorId: user.id,
        });

        const updated = this.requestRepository.findById(requestId)!;
        return { requestId, status: updated.status };
      });

      if (idempotencyKey) {
        const scope = buildCancelRequestScope(
          requestId,
          user.id,
          user.role,
          idempotencyKey,
        );
        this.idempotencyService.save(scope, idempotencyKey, result);
      }
      this.metricsService.increment('requestsCancelledTotal');
      this.eventLogger.emit({
        event: 'request.cancelled',
        requestId,
        employeeId: request.employeeId,
        locationId: request.locationId,
      });
      throw new OperationOkException(result);
    } catch (error) {
      if (error instanceof RequestTransitionConflictError) {
        throw new ConflictException('Request cannot be cancelled in current state');
      }
      if (error instanceof BalanceUpdateConflictError) {
        throw new ConflictException('Balance release conflict');
      }
      throw error;
    }
  }

  listPendingForManager(managerId: string, user: AuthUser) {
    if (user.role !== UserRole.MANAGER && user.role !== UserRole.SYSTEM_ADMIN) {
      throw new ForbiddenException('Manager access required');
    }
    if (user.role === UserRole.MANAGER && user.id !== managerId) {
      throw new ForbiddenException('Cannot view another manager queue');
    }

    return this.requestRepository.findByManagerAndStatus(
      managerId,
      RequestStatus.PENDING_MANAGER_APPROVAL,
    );
  }

  async approveRequest(
    requestId: string,
    user: AuthUser,
    idempotencyKey?: string,
  ) {
    const request = this.requestRepository.findById(requestId);
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    this.assertManagerCanAct(request, user);

    if (idempotencyKey) {
      const scope = buildApproveRequestScope(requestId, user.id, idempotencyKey);
      const cached = this.idempotencyService.getCached<Record<string, unknown>>(
        scope,
        idempotencyKey,
      );
      if (cached) {
        this.throwApproveHttpResult(cached);
      }
    }

    if (request.status === RequestStatus.APPROVED) {
      const result = {
        requestId,
        status: request.status,
        hcmTransactionId: request.hcmTransactionId,
      };
      throw new OperationOkException(result);
    }

    if (request.status === RequestStatus.FAILED_HCM_SUBMISSION) {
      return this.retryFailedHcmSubmission(requestId, user, idempotencyKey);
    }

    if (request.status !== RequestStatus.PENDING_MANAGER_APPROVAL) {
      throw new UnprocessableEntityException(
        'Request is not pending manager approval',
      );
    }

    const employee = this.employeeRepository.findById(request.employeeId)!;
    const location = this.locationRepository.findById(request.locationId)!;

    try {
      this.transactionManager.runInTransaction(() => {
        this.requestRepository.transitionStatus(
          requestId,
          RequestStatus.PENDING_MANAGER_APPROVAL,
          RequestStatus.APPROVED_PENDING_HCM,
        );
        this.statusHistoryRepository.create({
          requestId,
          fromStatus: RequestStatus.PENDING_MANAGER_APPROVAL,
          toStatus: RequestStatus.APPROVED_PENDING_HCM,
          actorType: ActorType.MANAGER,
          actorId: user.id,
        });
      });
    } catch (error) {
      if (error instanceof RequestTransitionConflictError) {
        throw new ConflictException('Request is no longer pending approval');
      }
      throw error;
    }

    try {
      const hcmBalance = await this.hcmClientService.getRealtimeBalance(
        employee.hcmEmployeeId,
        location.hcmLocationId,
      );

      if (hcmBalance.balance < request.amount) {
        this.handleFailedHcmValidation(requestId, user, 'Insufficient HCM balance');
      }

      const submission = await this.hcmClientService.submitTimeOff({
        employeeId: employee.hcmEmployeeId,
        locationId: location.hcmLocationId,
        amount: request.amount,
        unit: request.unit,
        externalRequestId: requestId,
      });

      const remainingBalance =
        submission.remainingBalance ?? hcmBalance.balance - request.amount;

      const result = this.finalizeApprovedRequest({
        requestId,
        user,
        hcmTransactionId: submission.transactionId,
        hcmBalanceBeforeApproval: hcmBalance.balance,
        remainingBalance,
      });

      this.saveApproveIdempotency(requestId, user.id, idempotencyKey, result);
      this.recordRequestApproved(result, request);
      throw new OperationOkException(result);
    } catch (error) {
      if (
        error instanceof OperationOkException ||
        error instanceof OperationAcceptedException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      if (error instanceof HcmClientError) {
        if (error.type === HcmErrorType.DUPLICATE_SUBMISSION) {
          const result = await this.handleDuplicateHcmSubmission(
            requestId,
            user,
            error,
          );
          this.saveApproveIdempotency(requestId, user.id, idempotencyKey, result);
          this.throwApproveHttpResult(result);
        }

        if (
          error.type === HcmErrorType.INSUFFICIENT_BALANCE ||
          error.type === HcmErrorType.INVALID_DIMENSIONS ||
          error.type === HcmErrorType.NOT_FOUND
        ) {
          this.handleFailedHcmValidation(requestId, user, error.message);
        }

        if (error.retryable) {
          const result = this.handleFailedHcmSubmission(
            requestId,
            user,
            error.message,
          );
          this.saveApproveIdempotency(requestId, user.id, idempotencyKey, result);
          throw new OperationAcceptedException(result);
        }

        throw new ServiceUnavailableException('HCM unavailable for approval');
      }

      const result = this.handleFailedHcmSubmission(
        requestId,
        user,
        (error as Error).message,
      );
      this.saveApproveIdempotency(requestId, user.id, idempotencyKey, result);
      throw new OperationAcceptedException(result);
    }
  }

  rejectRequest(
    requestId: string,
    user: AuthUser,
    reason: string,
    idempotencyKey?: string,
  ) {
    const request = this.requestRepository.findById(requestId);
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    this.assertManagerCanAct(request, user);

    const payload = { reason };
    if (idempotencyKey) {
      const scope = buildRejectRequestScope(
        requestId,
        user.id,
        idempotencyKey,
        payload,
      );
      const cached = this.idempotencyService.getCached<{ requestId: string; status: RequestStatus }>(
        scope,
        idempotencyKey,
      );
      if (cached) {
        throw new OperationOkException(cached);
      }
    }

    if (request.status !== RequestStatus.PENDING_MANAGER_APPROVAL) {
      throw new UnprocessableEntityException('Request is not pending approval');
    }

    try {
      const result = this.transactionManager.runInTransaction(() => {
        this.requestRepository.transitionStatus(
          requestId,
          RequestStatus.PENDING_MANAGER_APPROVAL,
          RequestStatus.REJECTED,
          { failureReason: reason },
        );

        this.balanceRepository.releaseReservedBalance(
          request.employeeId,
          request.locationId,
          request.amount,
        );

        this.statusHistoryRepository.create({
          requestId,
          fromStatus: RequestStatus.PENDING_MANAGER_APPROVAL,
          toStatus: RequestStatus.REJECTED,
          actorType: ActorType.MANAGER,
          actorId: user.id,
          reason,
        });

        this.auditService.log({
          entityType: 'TIME_OFF_REQUEST',
          entityId: requestId,
          action: 'REQUEST_REJECTED',
          actorType: ActorType.MANAGER,
          actorId: user.id,
          metadata: { reason },
        });

        return { requestId, status: RequestStatus.REJECTED };
      });

      if (idempotencyKey) {
        const scope = buildRejectRequestScope(
          requestId,
          user.id,
          idempotencyKey,
          payload,
        );
        this.idempotencyService.save(scope, idempotencyKey, result);
      }
      this.metricsService.increment('requestsRejectedTotal');
      this.eventLogger.emit({
        event: 'request.rejected',
        requestId,
        employeeId: request.employeeId,
        locationId: request.locationId,
      });
      throw new OperationOkException(result);
    } catch (error) {
      if (error instanceof RequestTransitionConflictError) {
        throw new ConflictException('Request is no longer pending approval');
      }
      if (error instanceof BalanceUpdateConflictError) {
        throw new ConflictException('Balance release conflict during rejection');
      }
      throw error;
    }
  }

  private async retryFailedHcmSubmission(
    requestId: string,
    user: AuthUser,
    idempotencyKey?: string,
  ) {
    const request = this.requestRepository.findById(requestId)!;
    const employee = this.employeeRepository.findById(request.employeeId)!;
    const location = this.locationRepository.findById(request.locationId)!;

    try {
      const submission = await this.hcmClientService.submitTimeOff({
        employeeId: employee.hcmEmployeeId,
        locationId: location.hcmLocationId,
        amount: request.amount,
        unit: request.unit,
        externalRequestId: requestId,
      });

      const hcmBalance = await this.hcmClientService.getRealtimeBalance(
        employee.hcmEmployeeId,
        location.hcmLocationId,
      );

      const result = this.finalizeApprovedRequest({
        requestId,
        user,
        hcmTransactionId: submission.transactionId,
        hcmBalanceBeforeApproval: hcmBalance.balance + request.amount,
        remainingBalance: submission.remainingBalance ?? hcmBalance.balance,
      });

      this.saveApproveIdempotency(requestId, user.id, idempotencyKey, result);
      throw new OperationOkException(result);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (error instanceof HcmClientError && error.type === HcmErrorType.DUPLICATE_SUBMISSION) {
        const result = await this.handleDuplicateHcmSubmission(requestId, user, error);
        this.saveApproveIdempotency(requestId, user.id, idempotencyKey, result);
        this.throwApproveHttpResult(result);
      }
      throw new ServiceUnavailableException('HCM retry failed');
    }
  }

  private finalizeApprovedRequest(input: {
    requestId: string;
    user: AuthUser;
    hcmTransactionId: string;
    hcmBalanceBeforeApproval: number;
    remainingBalance: number;
  }) {
    const request = this.requestRepository.findById(input.requestId)!;
    const fromStatus = request.status;

    return this.transactionManager.runInTransaction(() => {
      const updatedRequest = this.requestRepository.transitionStatusIfIn(
        input.requestId,
        [RequestStatus.APPROVED_PENDING_HCM, RequestStatus.FAILED_HCM_SUBMISSION],
        RequestStatus.APPROVED,
        { hcmTransactionId: input.hcmTransactionId },
      );

      this.balanceRepository.applyApprovalConsumption(
        request.employeeId,
        request.locationId,
        request.amount,
        input.remainingBalance,
      );

      this.statusHistoryRepository.create({
        requestId: input.requestId,
        fromStatus,
        toStatus: RequestStatus.APPROVED,
        actorType: ActorType.MANAGER,
        actorId: input.user.id,
      });

      this.auditService.log({
        entityType: 'TIME_OFF_REQUEST',
        entityId: input.requestId,
        action: 'REQUEST_APPROVED',
        actorType: ActorType.MANAGER,
        actorId: input.user.id,
        metadata: {
          hcmTransactionId: input.hcmTransactionId,
          hcmBalanceBeforeApproval: input.hcmBalanceBeforeApproval,
          remainingBalance: input.remainingBalance,
        },
      });

      return {
        requestId: input.requestId,
        status: updatedRequest.status,
        hcmTransactionId: updatedRequest.hcmTransactionId,
      };
    });
  }

  private async handleDuplicateHcmSubmission(
    requestId: string,
    user: AuthUser,
    error: HcmClientError,
  ): Promise<Record<string, unknown>> {
    const expectedTx = `hcm_tx_${requestId}`;
    const txId = error.transactionId;

    if (!txId || (txId !== expectedTx && !txId.includes(requestId))) {
      this.markReconciliationRequired(
        requestId,
        user,
        'Duplicate HCM submission could not be matched to local request',
      );
    }

    const request = this.requestRepository.findById(requestId)!;
    const employee = this.employeeRepository.findById(request.employeeId)!;
    const location = this.locationRepository.findById(request.locationId)!;

    let remainingBalance: number;
    try {
      const hcmBalance = await this.hcmClientService.getRealtimeBalance(
        employee.hcmEmployeeId,
        location.hcmLocationId,
      );
      remainingBalance = hcmBalance.balance;
    } catch {
      this.markReconciliationRequired(
        requestId,
        user,
        'Duplicate HCM submission detected, but balance lookup failed; reconciliation required',
      );
    }

    return this.finalizeApprovedRequest({
      requestId,
      user,
      hcmTransactionId: txId ?? expectedTx,
      hcmBalanceBeforeApproval: remainingBalance + request.amount,
      remainingBalance,
    });
  }

  private markReconciliationRequired(
    requestId: string,
    user: AuthUser,
    reason: string,
  ): never {
    const current = this.requestRepository.findById(requestId)!;
    const fromStatus = current.status;

    const result = this.transactionManager.runInTransaction(() => {
      const updated = this.requestRepository.transitionStatusIfIn(
        requestId,
        [
          RequestStatus.APPROVED_PENDING_HCM,
          RequestStatus.FAILED_HCM_SUBMISSION,
        ],
        RequestStatus.RECONCILIATION_REQUIRED,
        { failureReason: reason },
      );

      this.statusHistoryRepository.create({
        requestId,
        fromStatus,
        toStatus: RequestStatus.RECONCILIATION_REQUIRED,
        actorType: ActorType.SYSTEM,
        actorId: user.id,
        reason,
      });

      this.auditService.log({
        entityType: 'TIME_OFF_REQUEST',
        entityId: requestId,
        action: 'RECONCILIATION_REQUIRED',
        actorType: ActorType.SYSTEM,
        actorId: user.id,
        metadata: { reason },
      });

      this.eventLogger.emit({
        event: 'reconciliation.required',
        level: 'warn',
        requestId,
        reason,
      });

      return {
        requestId,
        status: updated.status,
        failureReason: reason,
      };
    });

    throw new ConflictException(result);
  }

  private recordRequestApproved(
    result: Record<string, unknown>,
    request: { employeeId: string; locationId: string },
  ): void {
    if (result.status !== RequestStatus.APPROVED) {
      return;
    }
    this.metricsService.increment('requestsApprovedTotal');
    this.eventLogger.emit({
      event: 'request.approved',
      requestId: result.requestId as string,
      employeeId: request.employeeId,
      locationId: request.locationId,
      hcmTransactionId: result.hcmTransactionId as string | undefined,
    });
  }

  private handleFailedHcmValidation(
    requestId: string,
    user: AuthUser,
    reason: string,
  ): never {
    const result = this.transactionManager.runInTransaction(() => {
      const request = this.requestRepository.findById(requestId)!;
      const updated = this.requestRepository.transitionStatusIfIn(
        requestId,
        [RequestStatus.APPROVED_PENDING_HCM],
        RequestStatus.FAILED_HCM_VALIDATION,
        { failureReason: reason },
      );

      this.balanceRepository.releaseReservedBalance(
        request.employeeId,
        request.locationId,
        request.amount,
      );

      this.statusHistoryRepository.create({
        requestId,
        fromStatus: RequestStatus.APPROVED_PENDING_HCM,
        toStatus: RequestStatus.FAILED_HCM_VALIDATION,
        actorType: ActorType.SYSTEM,
        actorId: user.id,
        reason,
      });

      this.auditService.log({
        entityType: 'TIME_OFF_REQUEST',
        entityId: requestId,
        action: 'HCM_VALIDATION_FAILED',
        actorType: ActorType.SYSTEM,
        actorId: user.id,
        metadata: { reason },
      });

      return { requestId, status: updated.status, failureReason: reason };
    });

    throw new ConflictException(result);
  }

  private handleFailedHcmSubmission(
    requestId: string,
    user: AuthUser,
    reason: string,
  ) {
    return this.transactionManager.runInTransaction(() => {
      const updated = this.requestRepository.transitionStatusIfIn(
        requestId,
        [RequestStatus.APPROVED_PENDING_HCM],
        RequestStatus.FAILED_HCM_SUBMISSION,
        { failureReason: reason },
      );

      this.statusHistoryRepository.create({
        requestId,
        fromStatus: RequestStatus.APPROVED_PENDING_HCM,
        toStatus: RequestStatus.FAILED_HCM_SUBMISSION,
        actorType: ActorType.SYSTEM,
        actorId: user.id,
        reason,
      });

      this.auditService.log({
        entityType: 'TIME_OFF_REQUEST',
        entityId: requestId,
        action: 'HCM_SUBMISSION_FAILED',
        actorType: ActorType.SYSTEM,
        actorId: user.id,
        metadata: { reason },
      });

      return {
        requestId,
        status: updated.status,
        failureReason: reason,
        pendingHcmRetry: true,
      };
    });
  }

  private throwApproveHttpResult(result: Record<string, unknown>): never {
    if (result.status === RequestStatus.FAILED_HCM_SUBMISSION) {
      throw new OperationAcceptedException(result);
    }
    if (result.status === RequestStatus.RECONCILIATION_REQUIRED) {
      throw new ConflictException(result);
    }
    throw new OperationOkException(result);
  }

  private assertMatchingCreatePayload(
    existing: {
      employeeId: string;
      locationId: string;
      amount: number;
      unit: BalanceUnit;
      startDate: string;
      endDate: string;
    },
    dto: {
      employeeId: string;
      locationId: string;
      amount: number;
      unit: BalanceUnit;
      startDate: string;
      endDate: string;
    },
  ): void {
    const existingHash = hashCreateRequestPayload({
      employeeId: existing.employeeId,
      locationId: existing.locationId,
      amount: existing.amount,
      unit: existing.unit,
      startDate: existing.startDate,
      endDate: existing.endDate,
    });
    const incomingHash = hashCreateRequestPayload(dto);

    if (existingHash !== incomingHash) {
      this.metricsService.increment('idempotencyMismatchTotal');
      this.eventLogger.emit({
        event: 'idempotency.mismatch',
        level: 'warn',
        employeeId: dto.employeeId,
        locationId: dto.locationId,
      });
      throw new ConflictException('Idempotency key reused with different payload');
    }
  }

  private saveCreateIdempotency(
    dto: {
      employeeId: string;
      locationId: string;
      amount: number;
      unit: BalanceUnit;
      startDate: string;
      endDate: string;
    },
    idempotencyKey: string | undefined,
    result: Record<string, unknown>,
  ): void {
    if (!idempotencyKey) {
      return;
    }
    const scope = buildCreateRequestScope(dto.employeeId, idempotencyKey, dto);
    this.idempotencyService.save(scope, idempotencyKey, result);
  }

  private saveApproveIdempotency(
    requestId: string,
    managerId: string,
    idempotencyKey: string | undefined,
    result: Record<string, unknown>,
  ): void {
    if (!idempotencyKey) {
      return;
    }
    const scope = buildApproveRequestScope(requestId, managerId, idempotencyKey);
    this.idempotencyService.save(scope, idempotencyKey, result);
  }

  private assertCanViewRequest(employeeId: string, user: AuthUser): void {
    if (
      user.role === UserRole.SYSTEM_ADMIN ||
      user.role === UserRole.SYSTEM_INTEGRATION
    ) {
      return;
    }
    if (user.role === UserRole.EMPLOYEE && user.id === employeeId) {
      return;
    }
    if (user.role === UserRole.MANAGER) {
      const employee = this.employeeRepository.findById(employeeId);
      if (employee?.managerId === user.id) {
        return;
      }
    }
    throw new ForbiddenException('Cannot view request');
  }

  private assertManagerCanAct(
    request: { employeeId: string; managerId: string | null },
    user: AuthUser,
  ): void {
    if (user.role === UserRole.SYSTEM_ADMIN) {
      return;
    }
    if (user.role !== UserRole.MANAGER) {
      throw new ForbiddenException('Manager role required');
    }
    const employee = this.employeeRepository.findById(request.employeeId);
    if (employee?.managerId !== user.id) {
      throw new ForbiddenException('Not authorized to act on this request');
    }
  }

  private assertActorCanCancel(
    request: { employeeId: string },
    user: AuthUser,
  ): void {
    if (
      user.role === UserRole.SYSTEM_ADMIN ||
      user.role === UserRole.SYSTEM_INTEGRATION
    ) {
      return;
    }
    if (user.role === UserRole.EMPLOYEE && user.id === request.employeeId) {
      return;
    }
    if (user.role === UserRole.MANAGER) {
      const employee = this.employeeRepository.findById(request.employeeId);
      if (employee?.managerId === user.id) {
        return;
      }
    }
    throw new ForbiddenException('Cannot cancel this request');
  }
}
