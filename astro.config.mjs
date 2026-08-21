import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';

// Server output — built into a standalone Node server (dist/server/entry.mjs)
// and run in a Docker container on Coolify. The contact form is a normal
// Astro API route (src/pages/api/contact.ts) served by that same process.
export default defineConfig({
  site: 'https://lingostar.ai',
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [sitemap()],
});
