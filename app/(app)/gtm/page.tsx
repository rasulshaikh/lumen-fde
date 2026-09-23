import { GtmView } from "@/components/Gtm";
import { GTM_MODULES, moduleById } from "@/lib/gtm/path";

/**
 * /gtm — module selection is the query string, read here.
 *
 * Same reason /plan reads `searchParams` in the server page: the deep link is already resolved
 * on a cold load, with no `useSearchParams` and no Suspense boundary between the URL and the
 * module. An id this path does not have falls back to the first module rather than rendering a
 * blank picker that claims a selection it cannot show.
 */
export default async function GtmPage({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }) {
  const { m } = await searchParams;
  const raw = Array.isArray(m) ? m[0] : m;
  const initial = raw && moduleById(raw) ? raw : GTM_MODULES[0].id;
  return <GtmView initialModule={initial} />;
}
