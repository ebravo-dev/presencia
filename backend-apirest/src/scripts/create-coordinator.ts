import argon2 from 'argon2';
import { prisma } from '../infrastructure/persistence/prisma/prisma.client.js';

const email = process.env.COORDINATOR_EMAIL?.trim().toLowerCase();
const name = process.env.COORDINATOR_NAME?.trim();
const password = process.env.COORDINATOR_PASSWORD;

if (!email || !name || !password || password.length < 12) {
  console.error('Define COORDINATOR_EMAIL, COORDINATOR_NAME y COORDINATOR_PASSWORD (minimo 12 caracteres).');
  process.exitCode = 1;
} else {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.coordinatorUser.upsert({
    where: { email }, create: { email, name, passwordHash }, update: { name, passwordHash, disabledAt: null },
  });
  console.log(`Coordinador provisionado: ${user.email}`);
}
await prisma.$disconnect();
