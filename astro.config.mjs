import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Static output, deployed as a Cloudflare Worker with static assets (see
// wrangler.toml). The contact form is the one dynamic route, handled by
// src/worker.ts rather than by anything in the Astro build itself.

// Reads each blog/page's pubDate straight from its frontmatter (no
// astro:content import here — that virtual module isn't resolvable from
// plain Node/Vite config loading) so the sitemap's <lastmod> reflects real
// publish dates instead of just "whenever this build ran". Routes with no
// natural date of their own (homepage, listing pages, the generated
// Spanish verb pages) fall back to build time in `serialize` below.
const contentDir = fileURLToPath(new URL('./src/content/', import.meta.url));

function frontmatterDate(raw, field) {
  const match = raw.match(new RegExp(`^${field}:\\s*"?([\\d-]+)"?`, 'm'));
  return match ? match[1] : null;
}

function buildLastmodMap() {
  const map = new Map();

  for (const file of readdirSync(contentDir + 'blog')) {
    if (!file.endsWith('.md')) continue;
    const raw = readFileSync(contentDir + 'blog/' + file, 'utf-8');
    const date = frontmatterDate(raw, 'updatedDate') || frontmatterDate(raw, 'pubDate');
    if (date) map.set(`/blog/${file.replace(/\.md$/, '')}/`, date);
  }

  for (const file of readdirSync(contentDir + 'pages')) {
    if (!file.endsWith('.md')) continue;
    const raw = readFileSync(contentDir + 'pages/' + file, 'utf-8');
    const date = frontmatterDate(raw, 'pubDate');
    if (date) map.set(`/${file.replace(/\.md$/, '')}/`, date);
  }

  return map;
}

const lastmodMap = buildLastmodMap();
const buildTime = new Date().toISOString();

export default defineConfig({
  site: 'https://lingostar.ai',
  output: 'static',
  integrations: [
    sitemap({
      // Keep noindex pages (see their BaseLayout `noindex` prop) out of the
      // sitemap too -- Google's guidance is not to list URLs you've told it
      // not to index.
      filter: (page) => !['privacy-policy', 'terms-of-service'].some((slug) => page.includes(`/${slug}/`)),
      serialize(item) {
        const path = new URL(item.url).pathname;
        item.lastmod = lastmodMap.get(path) ?? buildTime;
        return item;
      },
    }),
  ],
});
