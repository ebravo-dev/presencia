import argon2 from 'argon2';
import { prisma } from '../infrastructure/persistence/prisma/prisma.client.js';

const provisionOnlyIfConfigured = process.argv.includes('--if-configured');
const coordinators = readCoordinators();

if (provisionOnlyIfConfigured && coordinators.length === 0) {
  console.log('Provision de coordinador omitida: no se configuraron credenciales.');
} else if (coordinators.length === 0) {
  console.error('Define COORDINATORS_JSON o las variables COORDINATOR_EMAIL, COORDINATOR_NAME y COORDINATOR_PASSWORD.');
  process.exitCode = 1;
} else {
  for (const coordinator of coordinators) {
    const current = await prisma.coordinatorUser.findUnique({ where: { email: coordinator.email } });
    const passwordIsCurrent = current
      ? await argon2.verify(current.passwordHash, coordinator.password)
      : false;
    const passwordHash = current && passwordIsCurrent
      ? current.passwordHash
      : await argon2.hash(coordinator.password, { type: argon2.argon2id });

    const user = await prisma.coordinatorUser.upsert({
      where: { email: coordinator.email },
      create: { email: coordinator.email, name: coordinator.name, passwordHash },
      update: { name: coordinator.name, passwordHash, disabledAt: null },
    });
    console.log(`Coordinador provisionado: ${user.email}`);
  }
}
await prisma.$disconnect();

type CoordinatorSeed = { email: string; name: string; password: string };

function readCoordinators(): CoordinatorSeed[] {
  const values: unknown[] = [];
  const json = process.env.COORDINATORS_JSON?.trim();

  if (json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error('COORDINATORS_JSON debe contener JSON valido.');
    }
    if (!Array.isArray(parsed)) throw new Error('COORDINATORS_JSON debe ser un arreglo.');
    values.push(...parsed);
  }

  const legacyValues = [
    process.env.COORDINATOR_EMAIL,
    process.env.COORDINATOR_NAME,
    process.env.COORDINATOR_PASSWORD,
  ];
  if (legacyValues.some(Boolean)) {
    values.push({ email: legacyValues[0], name: legacyValues[1], password: legacyValues[2] });
  }

  const unique = new Map<string, CoordinatorSeed>();
  values.forEach((value, index) => {
    if (!value || typeof value !== 'object') throw invalidCoordinator(index);
    const candidate = value as Record<string, unknown>;
    const email = typeof candidate.email === 'string' ? candidate.email.trim().toLowerCase() : '';
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const password = typeof candidate.password === 'string' ? candidate.password : '';
    if (!email || !email.includes('@') || !name || password.length < 12) throw invalidCoordinator(index);
    unique.set(email, { email, name, password });
  });

  return [...unique.values()];
}

function invalidCoordinator(index: number): Error {
  return new Error(`Coordinador ${index + 1} invalido: requiere email, name y password de al menos 12 caracteres.`);
}
