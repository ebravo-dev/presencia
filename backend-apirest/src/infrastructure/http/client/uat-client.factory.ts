import { CookieJar } from 'tough-cookie';
import { env } from '../../../config/env.js';
import type { UatPortalClientPort } from '../../../domain/types/uat.interfaces.js';
import { UatPortalClient } from './uat-client.js';

export class UatClientFactory {
  create(): UatPortalClientPort {
    return new UatPortalClient({
      baseUrl: env.UAT_BASE_URL,
      timeoutMs: env.UAT_HTTP_TIMEOUT_MS,
      jar: new CookieJar(),
    });
  }
}
