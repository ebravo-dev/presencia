import { randomUUID } from 'node:crypto';
import {
  INITIAL_ACTIVE_CYCLE,
  type AcademicCycleChangeActor,
  type AcademicCycleRepository,
  type AcademicCycleValue,
  type ActiveAcademicCycleRecord,
} from '../domain/academic-cycle.js';
import { Prisma, type AcademicCycleConfiguration, type PrismaClient } from '../generated/prisma/index.js';

const CONFIGURATION_KEY = 'active';

export class PrismaAcademicCycleRepository implements AcademicCycleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  currentOrInitialize(initial: AcademicCycleValue): Promise<ActiveAcademicCycleRecord> {
    return this.withTransactionRetry(() => this.prisma.$transaction(async (transaction) => {
      const configuration = await transaction.academicCycleConfiguration.upsert({
        where: { key: CONFIGURATION_KEY },
        create: configurationData(initial),
        update: {},
      });
      await reconcileActiveCycle(transaction, configuration, 'academic-cycle-initialization');
      return toRecord(configuration);
    }, { isolationLevel: 'Serializable' }));
  }

  changeActiveCycle(cycle: AcademicCycleValue, actor: AcademicCycleChangeActor): Promise<ActiveAcademicCycleRecord> {
    return this.withTransactionRetry(() => this.prisma.$transaction(async (transaction) => {
      const current = await transaction.academicCycleConfiguration.upsert({
        where: { key: CONFIGURATION_KEY },
        create: configurationData(INITIAL_ACTIVE_CYCLE),
        update: {},
      });
      if (current.cycleExternalId === cycle.externalId) {
        await reconcileActiveCycle(transaction, current, actor.correlationId);
        return toRecord(current);
      }

      const updated = await transaction.academicCycleConfiguration.update({
        where: { key: CONFIGURATION_KEY },
        data: {
          cycleExternalId: cycle.externalId,
          cycleYear: cycle.year,
          cycleTerm: cycle.term,
          cycleName: cycle.name,
          revision: { increment: 1 },
          updatedByIdentityId: actor.actorIdentityId,
          correlationId: actor.correlationId,
        },
      });
      await transaction.academicCycleConfigurationAudit.create({
        data: {
          configurationKey: CONFIGURATION_KEY,
          previousCycleExternalId: current.cycleExternalId,
          nextCycleExternalId: updated.cycleExternalId,
          previousCycleName: current.cycleName,
          nextCycleName: updated.cycleName,
          actorIdentityId: actor.actorIdentityId,
          actorRole: actor.actorRole,
          reason: actor.reason,
          correlationId: actor.correlationId,
        },
      });
      await reconcileActiveCycle(transaction, updated, actor.correlationId);
      return toRecord(updated);
    }, { isolationLevel: 'Serializable' }));
  }

  private async withTransactionRetry<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError
          && (error.code === 'P2002' || error.code === 'P2034');
        if (!retryable || attempt === 3) throw error;
      }
    }
    throw new Error('Unreachable transaction retry state');
  }
}

async function reconcileActiveCycle(
  transaction: Prisma.TransactionClient,
  configuration: AcademicCycleConfiguration,
  correlationId: string,
) {
  const externalId = String(configuration.cycleExternalId);
  const selectedCycle = await transaction.academicCycle.upsert({
    where: { externalId },
    create: { externalId, name: configuration.cycleName, active: true },
    update: { name: configuration.cycleName, active: true },
  });
  const staleGroups = await transaction.academicGroup.findMany({
    where: { active: true, cycleId: { not: selectedCycle.id } },
    select: { id: true, externalGroupId: true },
  });
  await transaction.academicCycle.updateMany({
    where: { id: { not: selectedCycle.id }, active: true },
    data: { active: false },
  });
  if (staleGroups.length > 0) {
    await transaction.academicGroup.updateMany({
      where: { id: { in: staleGroups.map(({ id }) => id) } },
      data: { active: false },
    });
    await transaction.academicEnrollment.updateMany({
      where: { groupId: { in: staleGroups.map(({ id }) => id) } },
      data: { active: false },
    });
    for (const group of staleGroups) {
      await transaction.academicOutboxEvent.create({
        data: {
          eventId: randomUUID(),
          eventType: 'academic.group_deactivated.v1',
          aggregateId: group.externalGroupId,
          correlationId,
          causationId: correlationId,
          payload: { externalGroupId: group.externalGroupId, cycleExternalId: externalId },
        },
      });
    }
  }
}

function configurationData(cycle: AcademicCycleValue) {
  return {
    key: CONFIGURATION_KEY,
    cycleExternalId: cycle.externalId,
    cycleYear: cycle.year,
    cycleTerm: cycle.term,
    cycleName: cycle.name,
  };
}

function toRecord(configuration: AcademicCycleConfiguration): ActiveAcademicCycleRecord {
  return {
    externalId: configuration.cycleExternalId,
    year: configuration.cycleYear,
    term: configuration.cycleTerm as 1 | 2 | 3,
    name: configuration.cycleName,
    revision: configuration.revision,
    updatedAt: configuration.updatedAt,
    updatedByIdentityId: configuration.updatedByIdentityId,
  };
}
