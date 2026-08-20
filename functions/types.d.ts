// Minimal ambient type so functions/*.ts type-checks without pulling in
// @cloudflare/workers-types (which would clash with Astro's DOM lib types
// in the root tsconfig). Swap for the real package if this directory ever
// gets its own tsconfig.
type PagesFunction<Env = unknown> = (context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
  waitUntil: (promise: Promise<unknown>) => void;
}) => Response | Promise<Response>;
