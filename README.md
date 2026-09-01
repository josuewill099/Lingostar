# Lingostar

Static site (migrated from WordPress) built with [Astro](https://astro.build) and
deployed as a [Cloudflare Worker with static assets](https://developers.cloudflare.com/workers/static-assets/)
(git-integrated via Workers Builds — see `wrangler.toml`).

- Content lives as Markdown in `src/content/blog/` (posts) and `src/content/pages/` (static pages).
- Spanish verb conjugation pages (`/spanish/conjugation/*`) are a programmatic SEO batch generated
  by `scripts/build_verbs.mjs` from `src/content/verbs/*.json`.
- The contact form posts to `/api/contact`, handled by `src/worker.ts` — the one dynamic route;
  everything else is served directly from the `dist/` build via the `ASSETS` binding.
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

## Migration plan: WordPress → GitHub → Cloudflare

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

### 4. Connect the repo to Cloudflare

In the Cloudflare dashboard: **Workers & Pages → Create → Workers → Connect to Git**,
select this repository. Cloudflare reads the build/deploy config straight from
`wrangler.toml` (build command `npm run build`, assets directory `./dist`,
worker entry `src/worker.ts`) — a Workers Build runs `npm run build` then
`wrangler deploy` on every push, with preview deployments for other branches/PRs.

### 5. Configure environment variables & comments

In the Workers project's **Settings → Variables and Secrets**, add:

- `RESEND_API_KEY` (secret) — from [resend.com](https://resend.com), for the contact form
- `CONTACT_TO` — the email address that should receive form submissions

For Giscus comments: enable **Discussions** on this GitHub repo (Settings →
General → Features), install the [giscus app](https://github.com/apps/giscus)
on it, then go to [giscus.app](https://giscus.app), enter this repo, and copy
the `data-repo-id` / `data-category-id` values it gives you into
`PUBLIC_GISCUS_REPO`, `PUBLIC_GISCUS_REPO_ID`, `PUBLIC_GISCUS_CATEGORY`, and
`PUBLIC_GISCUS_CATEGORY_ID` as environment variables (these are public, no
need to mark them secret).

Also update the sender address in `src/worker.ts` (`from:`) to an address on a
domain you've verified in Resend.

### 6. DNS cutover

1. Add your domain to Cloudflare (if it isn't already) and let it become active.
2. In the Workers project, go to **Settings → Domains & Routes → Add** and
   add your apex/subdomain — Cloudflare configures the DNS record for you if
   the zone is already on Cloudflare.
3. **Before** switching, set up redirects for any old URLs that changed shape
   (e.g. `/2025/01/hello-world/` → `/blog/hello-world/`). Workers static
   assets support the same `_redirects` file convention Pages used — add a
   `public/_redirects` file:

   ```
   /2025/01/hello-world/  /blog/hello-world/  301
   ```

4. Keep the WordPress host running (don't cancel it) for a couple of weeks
   after cutover as a fallback, and to still access old media files you may
   have missed.
5. Once DNS is confirmed pointing at the Worker and everything checks out,
   cancel the WordPress hosting.

### 7. Post-migration checklist

- [ ] Submit the new sitemap (`/sitemap-index.xml`) to Google Search Console.
- [ ] Verify old URLs 301-redirect correctly (check your top pages by traffic first).
- [ ] Re-check any embedded forms/widgets that relied on WordPress plugins.
- [ ] Confirm Giscus comments and the contact form work in production, not just locally.
- [ ] Set up uptime monitoring / analytics (e.g. Cloudflare Web Analytics — free, no cookies).
