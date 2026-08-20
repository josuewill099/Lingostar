# Lingostar

Site (migrated from WordPress) built with [Astro](https://astro.build) in
server (SSR) mode via the [Node adapter](https://docs.astro.build/en/guides/integrations-guide/node/),
deployed as a Docker container on [Coolify](https://coolify.io).

- Content lives as Markdown in `src/content/blog/` (posts) and `src/content/pages/` (static pages).
- The contact form posts to an Astro API route at `src/pages/api/contact.ts`, which runs
  server-side in the same Node process as the rest of the site.
- Comments use [Giscus](https://giscus.app), backed by GitHub Discussions on this repo — no separate database needed.

## Local development

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # outputs to dist/
npm run preview   # preview the production build locally
```

Copy `.env.example` to `.env` and fill in the Giscus values to see comments locally.

---

## Migration plan: WordPress → GitHub → Cloudflare Pages

### 1. Export content from WordPress

In wp-admin: **Tools → Export → All content** → download the `.xml` (WXR) file.
This captures posts, pages, categories/tags, and comment/media *references* (not
the actual media files).

Separately, back up your media library files (via your host's file manager, SFTP,
or a plugin like *All-in-One WP Migration*) — you'll need the actual images.

### 2. Convert the export to Markdown

```bash
npm run migrate:wxr -- ./path/to/your-export.xml --pages --base-url https://your-old-domain.com
```

This writes one `.md` file per post/page into `src/content/blog/` (and
`src/content/pages/` with `--pages`), with frontmatter (`title`, `pubDate`,
`author`, `tags`, etc.) and the HTML body converted to Markdown. The
`--base-url` flag strips your old domain from image/link URLs so they become
relative paths.

Then, by hand:
- Delete the placeholder post `src/content/blog/welcome-to-your-new-site.md`.
- Review each generated file for conversion artifacts (embeds, shortcodes,
  custom blocks, and WP-specific HTML often need manual cleanup — Turndown
  converts standard HTML well, but WordPress block/shortcode markup isn't HTML).
- Download the images referenced in your posts from the old media library into
  `public/uploads/...` (matching the relative paths left after `--base-url`
  stripping), or upload them to Cloudflare Images / an R2 bucket and update the
  paths.
- Decide on URL structure: if your old permalinks were `/2025/01/hello-world/`
  and the new ones are `/blog/hello-world/`, plan redirects (see step 6).

### 3. Push the site to GitHub

This repo is already set up. Once your content is migrated:

```bash
git add -A
git commit -m "Migrate content from WordPress"
git push
```

### 4. Connect the repo to Coolify

In Coolify: **Add a new resource → Application → Public/Private Git repository**,
point it at this repo, and set:

| Setting | Value |
|---|---|
| Build pack | Dockerfile |
| Dockerfile location | `Dockerfile` (repo root) |
| Port | `4321` |

Coolify builds the image from the `Dockerfile` in this repo (multi-stage:
`npm ci && npm run build`, then runs `node ./dist/server/entry.mjs`) and can
auto-deploy on every push if you enable the webhook on the resource.

### 5. Configure environment variables & comments

In the Coolify application's **Environment Variables** tab, add:

- `RESEND_API_KEY` (mark as secret) — from [resend.com](https://resend.com), for the contact form
- `CONTACT_TO` — the email address that should receive form submissions
- `PUBLIC_GISCUS_REPO`, `PUBLIC_GISCUS_REPO_ID`, `PUBLIC_GISCUS_CATEGORY`, `PUBLIC_GISCUS_CATEGORY_ID` — for comments (see below)

These are read at runtime by the Node process (`process.env`), so no rebuild
is needed after changing them — just restart the app in Coolify.

For Giscus comments: enable **Discussions** on this GitHub repo (Settings →
General → Features), install the [giscus app](https://github.com/apps/giscus)
on it, then go to [giscus.app](https://giscus.app), enter this repo, and copy
the `data-repo-id` / `data-category-id` values it gives you into the
`PUBLIC_GISCUS_*` variables above.

Also update the sender address in `src/pages/api/contact.ts` (`from:`) to an
address on a domain you've verified in Resend, and the `site` URL in
`astro.config.mjs`.

### 6. DNS cutover

1. In the Coolify application, go to **Domains** and add your apex/subdomain.
   Coolify provisions a Let's Encrypt certificate for it automatically once
   DNS resolves to your server.
2. Point your domain's DNS (A/AAAA record, or CNAME if you're behind a proxy)
   at the server Coolify is running on.
3. **Before** switching, set up redirects for any old URLs that changed shape
   (e.g. `/2025/01/hello-world/` → `/blog/hello-world/`). Add these as
   `Astro.redirect()` routes, or as reverse-proxy rules in Coolify's Traefik/
   Caddy config if you'd rather handle them outside the app.
4. Keep the WordPress host running (don't cancel it) for a couple of weeks
   after cutover as a fallback, and to still access old media files you may
   have missed.
5. Once DNS is confirmed pointing at the Coolify app and everything checks
   out, cancel the WordPress hosting.

### 7. Post-migration checklist

- [ ] Submit the new sitemap (`/sitemap-index.xml`, generated automatically if
      you add `@astrojs/sitemap`) to Google Search Console.
- [ ] Verify old URLs 301-redirect correctly (check your top pages by traffic first).
- [ ] Re-check any embedded forms/widgets that relied on WordPress plugins.
- [ ] Confirm Giscus comments and the contact form work in production, not just locally.
- [ ] Set up uptime monitoring / analytics (e.g. Cloudflare Web Analytics — free, no cookies).
