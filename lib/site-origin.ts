import "server-only";

import { headers } from "next/headers";

/**
 * Absolute origin of this deployment, with no trailing slash.
 *
 * Prefers the configured site URL so emailed links stay stable; falls back
 * to the request's own host, which is what makes a preview deployment
 * generate links back to itself rather than to production.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  return host ? `${protocol}://${host}` : "http://localhost:3000";
}
