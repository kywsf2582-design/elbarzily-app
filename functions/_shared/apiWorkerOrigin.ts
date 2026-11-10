export type ApiProxyEnv = { API_WORKER_ORIGIN?: string };

const STAGING_WORKER_ORIGIN = "https://elbarzily-api-staging.a62165368.workers.dev";
const PRODUCTION_WORKER_ORIGIN = "https://elbarzily-api.a62165368.workers.dev";
const PRODUCTION_PAGES_HOST = "elbarzily-production.pages.dev";
const STAGING_PAGES_HOSTS = ["elbarzily-neon-staging.pages.dev", "elbarzily-staging.pages.dev"];

export function resolveApiWorkerOrigin(request: Request, env?: ApiProxyEnv): string | null {
  const host = new URL(request.url).hostname.toLowerCase();
  const isProductionHost = host === PRODUCTION_PAGES_HOST;
  const isProductionPreview = host.endsWith(`.${PRODUCTION_PAGES_HOST}`);
  const isStagingPages = STAGING_PAGES_HOSTS.some(base => host === base || host.endsWith(`.${base}`));
  const configured = env?.API_WORKER_ORIGIN?.trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash)
        return null;
      if ((isProductionHost || isProductionPreview) && parsed.origin === STAGING_WORKER_ORIGIN) return null;
      if (isStagingPages && parsed.origin === PRODUCTION_WORKER_ORIGIN) return null;
      return parsed.origin;
    } catch {
      return null;
    }
  }

  if (isProductionHost) return PRODUCTION_WORKER_ORIGIN;
  if (isProductionPreview) return null;
  return STAGING_WORKER_ORIGIN;
}
