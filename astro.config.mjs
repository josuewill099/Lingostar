import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Static output, deployed as a Cloudflare Worker with static assets (see
// wrangler.toml). The contact form is the one dynamic route, handled by
// src/worker.ts rather than by anything in the Astro build itself.
export default defineConfig({
  site: 'https://lingostar.ai',
  output: 'static',
  integrations: [sitemap()],
});
