import { CookieJar } from 'tough-cookie';
import { env } from '../../../config/env.js';
import type { UatSessionSource, UatStudentPortalClientPort } from '../../../domain/types/uat.interfaces.js';
import { UatStudentPortalClient } from './uat-student-client.js';

export class UatStudentClientFactory {
  create(): UatStudentPortalClientPort {
    return this.fromJar(new CookieJar(), 'UAT');
  }

  createFor(username: string): { client: UatStudentPortalClientPort; source: UatSessionSource } {
    const source = this.sourceFor(username);
    return { client: this.fromJar(new CookieJar(), source), source };
  }

  restore(serializedCookieJar: unknown, source: UatSessionSource = 'UAT'): UatStudentPortalClientPort {
    return this.fromJar(CookieJar.deserializeSync(serializedCookieJar as CookieJar.Serialized), source);
  }

  private sourceFor(username: string): UatSessionSource {
    return env.PRESENCIA_APP_REVIEW_ENABLED
      && username.trim().toLowerCase() === env.PRESENCIA_APP_REVIEW_STUDENT_USERNAME
      ? 'APP_REVIEW'
      : 'UAT';
  }

  private fromJar(jar: CookieJar, source: UatSessionSource): UatStudentPortalClientPort {
    return new UatStudentPortalClient({
      baseUrl: source === 'APP_REVIEW' ? env.PRESENCIA_DEMO_PORTAL_URL : env.UAT_ALUMNOS_BASE_URL,
      timeoutMs: env.UAT_HTTP_TIMEOUT_MS,
      jar,
    });
  }
}
