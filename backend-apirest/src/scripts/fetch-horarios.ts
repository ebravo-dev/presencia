import 'dotenv/config';
import { UatClientFactory } from '../infrastructure/http/client/uat-client.factory.js';
import type { UatProfesorConsultaParams } from '../domain/types/uat.interfaces.js';

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }

  return value;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} debe ser un entero positivo.`);
  }

  return value;
}

async function main(): Promise<void> {
  const username = requiredEnv('UAT_USER');
  const password = requiredEnv('UAT_PASS');
  const query: UatProfesorConsultaParams = {
    Id_Ciclo_Escolar: numberEnv('UAT_ID_CICLO_ESCOLAR', 150),
    Id_DES: numberEnv('UAT_ID_DES', 12),
  };

  const client = new UatClientFactory().create();
  const login = await client.authenticate({ username, password });
  const horarios = await client.getHorarios(query);
  const examenes = await client.getExamenes(query);

  console.log(
    JSON.stringify(
      {
        authenticated: true,
        login: {
          exito: login.exito,
          cambiaPass: login.cambiaPass,
          mensaje: login.mensaje,
          parametros: login.parametros,
        },
        query,
        horarios,
        examenes,
        fetchedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
