import { env } from '../config/env.js';
import { prisma } from '../infrastructure/persistence/prisma/prisma.client.js';
import { IdentityServiceClient } from '../infrastructure/http/client/identity-service.client.js';

if (!env.IDENTITY_SERVICE_URL) throw new Error('IDENTITY_SERVICE_URL is required to import coordinator accounts.');

const accounts = await prisma.coordinatorUser.findMany({
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
const identity = new IdentityServiceClient(env.IDENTITY_SERVICE_URL, env.INTERNAL_API_TOKEN, true);

await identity.importStaffAccounts(accounts.map((account) => ({
  legacySourceId: account.id,
  email: account.email,
  name: account.name,
  passwordHash: account.passwordHash,
  role: account.role === 'READ_ONLY' ? 'READ_ONLY' : 'COORDINATOR',
  disabled: account.disabledAt !== null,
})), {
  actorIdentityId: 'migration:coordinator-account-import',
  correlationId: 'migration:coordinator-account-import',
  reason: 'Adopción inicial de cuentas coordinadoras desde backend-apirest.',
});

console.log(JSON.stringify({ imported: accounts.length, source: 'backend-apirest.coordinator_users' }));
await prisma.$disconnect();
