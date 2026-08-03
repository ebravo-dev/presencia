import { CookieJar } from 'tough-cookie';
import { env } from '../../../config/env.js';
import type { UatPortalClientPort } from '../../../domain/types/uat.interfaces.js';
import { UatPortalClient } from './uat-client.js';

export class UatClientFactory {
  create(): UatPortalClientPort {
    return this.fromJar(new CookieJar());
  }

  restore(serializedCookieJar: unknown): UatPortalClientPort {
    return this.fromJar(CookieJar.deserializeSync(serializedCookieJar as CookieJar.Serialized));
  }

  private fromJar(jar: CookieJar): UatPortalClientPort {
    return new UatPortalClient({
      baseUrl: env.PRESENCIA_DEBUG_MODE ? env.PRESENCIA_DEMO_PORTAL_URL : env.UAT_BASE_URL,
      timeoutMs: env.UAT_HTTP_TIMEOUT_MS,
      jar,
    });
  }
}
