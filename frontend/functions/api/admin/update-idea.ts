/**
 * Endpoint scrubbed for public release.
 *
 * The original implementation handled privileged on-chain or admin-only
 * operations and relied on signing keys / API credentials that are not
 * included in this public repository.
 */

const NotAvailable = (): Response =>
  new Response(
    JSON.stringify({ error: "Not available in public release" }),
    { status: 501, headers: { "content-type": "application/json" } }
  );

export const onRequestGet: PagesFunction = async () => NotAvailable();
export const onRequestPost: PagesFunction = async () => NotAvailable();
export const onRequestPut: PagesFunction = async () => NotAvailable();
export const onRequestDelete: PagesFunction = async () => NotAvailable();
export const onRequestOptions: PagesFunction = async () => NotAvailable();
