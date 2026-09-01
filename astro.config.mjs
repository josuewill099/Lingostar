import { defineConfig } from 'astro/config';

// Static output — deployed to Cloudflare Pages as plain HTML/CSS/JS.
// Dynamic bits (contact form) are handled separately by Cloudflare Pages
// Functions in /functions, which run alongside the static build.
export default defineConfig({
  site: 'https://lingostar.ai',
  output: 'static',
});
