export interface ConfiguredCoordinator {
  email: string;
  name: string;
  password: string;
  role: 'COORDINATOR' | 'READ_ONLY';
}

export function readConfiguredCoordinators(source: NodeJS.ProcessEnv = process.env): ConfiguredCoordinator[] {
  const values: unknown[] = [];
  const json = source.COORDINATORS_JSON?.trim();
  if (json) {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) throw new Error('COORDINATORS_JSON debe ser un arreglo.');
    values.push(...parsed);
  }
  if ([source.COORDINATOR_EMAIL, source.COORDINATOR_NAME, source.COORDINATOR_PASSWORD].some(Boolean)) {
    values.push({
      email: source.COORDINATOR_EMAIL,
      name: source.COORDINATOR_NAME,
      password: source.COORDINATOR_PASSWORD,
    });
  }
  const accounts = new Map<string, ConfiguredCoordinator>();
  values.forEach((value, index) => {
    if (!value || typeof value !== 'object') throw invalidConfiguredCoordinator(index);
    const candidate = value as Record<string, unknown>;
    const email = typeof candidate.email === 'string' ? candidate.email.trim().toLowerCase() : '';
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const password = typeof candidate.password === 'string' ? candidate.password : '';
    const role = candidate.role === 'READ_ONLY' ? 'READ_ONLY' : 'COORDINATOR';
    if (!email.includes('@') || !name || password.length < 12) throw invalidConfiguredCoordinator(index);
    accounts.set(email, { email, name, password, role });
  });
  return [...accounts.values()];
}

function invalidConfiguredCoordinator(index: number) {
  return new Error(`Coordinador ${index + 1} inválido: requiere email, name y password de al menos 12 caracteres.`);
}
