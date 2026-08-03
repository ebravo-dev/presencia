import argon2 from 'argon2';
import { readConfiguredCoordinators } from '../application/services/coordinator-seed-reader.js';
import { env } from '../config/env.js';
import { prisma } from '../infrastructure/persistence/prisma/prisma.client.js';
import { IdentityServiceClient } from '../infrastructure/http/client/identity-service.client.js';

if (!env.IDENTITY_SERVICE_URL) throw new Error('IDENTITY_SERVICE_URL is required to import coordinator accounts.');

const legacyAccounts = await prisma.coordinatorUser.findMany({
  orderBy: { createdAt: 'asc' },
  select: {
    id: true,
    email: true,
    name: true,
    passwordHash: true,
    role: true,
    disabledAt: true,
  },
});
const records = new Map(legacyAccounts.map((account) => [account.email.toLowerCase(), {
  legacySourceId: account.id,
  email: account.email,
  name: account.name,
  passwordHash: account.passwordHash,
  role: (account.role === 'READ_ONLY' ? 'READ_ONLY' : 'COORDINATOR') as 'COORDINATOR' | 'READ_ONLY',
  disabled: account.disabledAt !== null,
}]));
for (const account of readConfiguredCoordinators()) {
  records.set(account.email, {
    legacySourceId: `configured:${account.email}`,
    email: account.email,
    name: account.name,
    passwordHash: await argon2.hash(account.password, { type: argon2.argon2id }),
    role: account.role,
    disabled: false,
  });
}

const identity = new IdentityServiceClient(env.IDENTITY_SERVICE_URL, env.INTERNAL_API_TOKEN);
await identity.importStaffAccounts([...records.values()], {
  actorIdentityId: 'migration:coordinator-account-import',
  correlationId: 'migration:coordinator-account-import',
  reason: 'Adopción inicial de cuentas coordinadoras desde backend-apirest.',
});

console.log(JSON.stringify({ imported: records.size, source: 'legacy-and-configured-coordinator-accounts' }));
await prisma.$disconnect();
