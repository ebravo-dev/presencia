import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const cycle = currentCycle();
  const primaryEmail = readEnv('SEED_PRIMARY_EMAIL', 'titular.pruebas@uat.edu.mx');
  const secondaryEmail = readEnv('SEED_SECONDARY_EMAIL', 'profesor2.pruebas@uat.edu.mx');

  const coordination = await prisma.coordination.upsert({
    where: { externalId: 'SEED-FI' },
    create: { externalId: 'SEED-FI', name: 'Coordinacion de prueba FI', shortName: 'FI Seed' },
    update: { name: 'Coordinacion de prueba FI', shortName: 'FI Seed' },
  });

  const primary = await prisma.teacher.upsert({
    where: { externalId: 'SEED-TEACHER-PRIMARY' },
    create: {
      externalId: 'SEED-TEACHER-PRIMARY',
      institutionalCode: 'SEED-T1',
      name: 'Profesor Titular de Prueba',
      email: primaryEmail,
      lastAuthenticatedAt: new Date(),
      lastHarvestedAt: new Date(),
    },
    update: { email: primaryEmail, name: 'Profesor Titular de Prueba' },
  });

  const secondary = await prisma.teacher.upsert({
    where: { externalId: 'SEED-TEACHER-SECONDARY' },
    create: {
      externalId: 'SEED-TEACHER-SECONDARY',
      institutionalCode: 'SEED-T2',
      name: 'Profesor Receptor de Prueba',
      email: secondaryEmail,
      lastAuthenticatedAt: new Date(),
      lastHarvestedAt: null,
    },
    update: { email: secondaryEmail, name: 'Profesor Receptor de Prueba' },
  });

  const subject = await prisma.subject.upsert({
    where: { externalId: 'SEED-FI:RC.SEED.1001' },
    create: {
      externalId: 'SEED-FI:RC.SEED.1001',
      code: 'RC.SEED.1001',
      name: 'DESARROLLO DE APLICACIONES - PRUEBA',
      coordinationId: coordination.id,
    },
    update: {
      code: 'RC.SEED.1001',
      name: 'DESARROLLO DE APLICACIONES - PRUEBA',
      coordinationId: coordination.id,
    },
  });

  const group = await prisma.groupAssignment.upsert({
    where: { externalGroupId: '9900001' },
    create: {
      externalGroupId: '9900001',
      groupCode: 'Z',
      schoolCycleExternalId: `SEED-${cycle.code}`,
      schoolCycleName: cycle.name,
      classroom: 'LAB-SEED-01',
      educationLevel: 'LICENCIATURA',
      period: cycle.name,
      schedule: sampleSchedule(),
      rawPayload: { source: 'SEED', purpose: 'shared-class-flow' },
      teacherId: primary.id,
      subjectId: subject.id,
      coordinationId: coordination.id,
    },
    update: {
      groupCode: 'Z',
      schoolCycleExternalId: `SEED-${cycle.code}`,
      schoolCycleName: cycle.name,
      classroom: 'LAB-SEED-01',
      educationLevel: 'LICENCIATURA',
      period: cycle.name,
      schedule: sampleSchedule(),
      rawPayload: { source: 'SEED', purpose: 'shared-class-flow' },
      teacherId: primary.id,
      subjectId: subject.id,
      coordinationId: coordination.id,
    },
  });

  console.log('Seeder de clase compartida listo.');
  console.log(`Titular: ${primary.name} <${primary.email}>`);
  console.log(`Profesor 2: ${secondary.name} <${secondary.email}>`);
  console.log(`Clase: ${subject.name}, grupo Z, ${cycle.name}, ${group.classroom}`);
  console.log('La clase no fue compartida automaticamente; asignala desde Coordinacion > Infraestructura.');
}

function sampleSchedule() {
  const slot = (raw: string, startTime: string, endTime: string) => [{ raw, startTime, endTime }];
  return {
    monday: slot('10:00-11:00', '10:00', '11:00'),
    tuesday: [],
    wednesday: slot('10:00-11:00', '10:00', '11:00'),
    thursday: [],
    friday: slot('10:00-11:00', '10:00', '11:00'),
    saturday: [],
    sunday: [],
  };
}

function currentCycle(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const term = month <= 5 ? 1 : month <= 7 || (month === 8 && day <= 7) ? 2 : 3;
  const season = term === 1 ? 'PRIMAVERA' : term === 2 ? 'VERANO' : 'OTONO';
  return { code: `${year}-${term}`, name: `${year} - ${term} ${season}` };
}

function readEnv(name: string, fallback: string) {
  return process.env[name]?.trim().toLowerCase() || fallback;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
