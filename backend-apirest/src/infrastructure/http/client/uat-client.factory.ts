import { CookieJar } from 'tough-cookie';
import { env } from '../../../config/env.js';
import type { UatPortalClientPort, UatSessionSource } from '../../../domain/types/uat.interfaces.js';
import { UatPortalClient } from './uat-client.js';

export class UatClientFactory {
  create(): UatPortalClientPort {
    return this.fromJar(new CookieJar(), 'UAT');
  }

  createFor(username: string): { client: UatPortalClientPort; source: UatSessionSource } {
    const source = this.sourceFor(username);
    return { client: this.fromJar(new CookieJar(), source), source };
  }

  restore(serializedCookieJar: unknown, source: UatSessionSource = 'UAT'): UatPortalClientPort {
    return this.fromJar(CookieJar.deserializeSync(serializedCookieJar as CookieJar.Serialized), source);
  }

  private sourceFor(username: string): UatSessionSource {
    return env.PRESENCIA_APP_REVIEW_ENABLED
      && username.trim().toLowerCase() === env.PRESENCIA_APP_REVIEW_TEACHER_USERNAME
      ? 'APP_REVIEW'
      : 'UAT';
  }

  private fromJar(jar: CookieJar, source: UatSessionSource): UatPortalClientPort {
    return new UatPortalClient({
      // App Review accounts use the private compatibility portal. Every other
      // account remains connected to the institutional UAT portal.
      baseUrl: source === 'APP_REVIEW' ? env.PRESENCIA_DEMO_PORTAL_URL : env.UAT_BASE_URL,
      timeoutMs: env.UAT_HTTP_TIMEOUT_MS,
      jar,
    });
  }
}
