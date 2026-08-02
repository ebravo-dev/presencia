import { CookieJar } from 'tough-cookie';
import { env } from '../../../config/env.js';
import type { UatStudentPortalClientPort } from '../../../domain/types/uat.interfaces.js';
import { UatStudentPortalClient } from './uat-student-client.js';

export class UatStudentClientFactory {
  create(): UatStudentPortalClientPort {
    return this.fromJar(new CookieJar());
  }

  restore(serializedCookieJar: unknown): UatStudentPortalClientPort {
    return this.fromJar(CookieJar.deserializeSync(serializedCookieJar as CookieJar.Serialized));
  }

  private fromJar(jar: CookieJar): UatStudentPortalClientPort {
    return new UatStudentPortalClient({
      baseUrl: env.UAT_ALUMNOS_BASE_URL,
      timeoutMs: env.UAT_HTTP_TIMEOUT_MS,
      jar,
    });
  }
}
