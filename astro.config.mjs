import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Server output — built into a standalone Node server (dist/server/entry.mjs)
// and run in a Docker container on Coolify. The contact form is a normal
// Astro API route (src/pages/api/contact.ts) served by that same process.
export default defineConfig({
  site: 'https://example.com', // TODO: replace with your production domain
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
});
