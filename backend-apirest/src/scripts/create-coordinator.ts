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
      create: { email: coordinator.email, name: coordinator.name, passwordHash, role: coordinator.role },
      update: { name: coordinator.name, passwordHash, role: coordinator.role, disabledAt: null },
    });
    console.log(`Cuenta administrativa provisionada: ${user.email} (${user.role})`);
  }
}
await prisma.$disconnect();

type CoordinatorSeed = { email: string; name: string; password: string; role: 'COORDINATOR' | 'READ_ONLY' };

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

  const superAdminEmail = firstEnv('SUPERADMIN_EMAIL', 'SUPER_ADMIN_EMAIL');
  const superAdminPassword = firstEnv('SUPERADMIN_PASSWORD', 'SUPER_ADMIN_PASSWORD');
  const superAdminName = firstEnv('SUPERADMIN_NAME', 'SUPER_ADMIN_NAME') ?? 'Super Admin';
  const superAdminRole = firstEnv('SUPERADMIN_ROLE', 'SUPER_ADMIN_ROLE') ?? 'COORDINATOR';
  if (superAdminEmail || superAdminPassword) {
    values.push({
      email: superAdminEmail,
      name: superAdminName,
      password: superAdminPassword,
      role: superAdminRole,
    });
  }

  const unique = new Map<string, CoordinatorSeed>();
  values.forEach((value, index) => {
    if (!value || typeof value !== 'object') throw invalidCoordinator(index);
    const candidate = value as Record<string, unknown>;
    const email = typeof candidate.email === 'string' ? candidate.email.trim().toLowerCase() : '';
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const password = typeof candidate.password === 'string' ? candidate.password : '';
    const role = normalizeRole(typeof candidate.role === 'string' ? candidate.role : undefined);
    if (!email || !email.includes('@') || !name || password.length < 12) throw invalidCoordinator(index);
    unique.set(email, { email, name, password, role });
  });

  return [...unique.values()];
}

function invalidCoordinator(index: number): Error {
  return new Error(`Cuenta ${index + 1} invalida: requiere email, name y password de al menos 12 caracteres.`);
}

function firstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function normalizeRole(role?: string): 'COORDINATOR' | 'READ_ONLY' {
  return role?.trim().toUpperCase() === 'READ_ONLY' ? 'READ_ONLY' : 'COORDINATOR';
}
