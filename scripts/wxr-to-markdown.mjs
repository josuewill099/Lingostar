#!/usr/bin/env node
// Converts a WordPress WXR export (Tools > Export in wp-admin) into Astro
// content-collection Markdown files.
//
// Usage:
//   npm run migrate:wxr -- ./wxr-export/mysite.xml
//   npm run migrate:wxr -- ./wxr-export/mysite.xml --pages --base-url https://old-site.com
//
// Flags:
//   --pages              also export post_type "page" (written to src/content/pages)
//   --base-url <url>     strip this prefix from <img>/<a> URLs so they become
//                         relative (you still need to copy the media files
//                         themselves into public/, see README)
//   --out <dir>          override output dir for posts (default: src/content/blog)

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import TurndownService from 'turndown';

const args = process.argv.slice(2);
const inputPath = args.find((a) => !a.startsWith('--'));
const includePages = args.includes('--pages');
const baseUrlIndex = args.indexOf('--base-url');
const baseUrl = baseUrlIndex !== -1 ? args[baseUrlIndex + 1] : null;
const outIndex = args.indexOf('--out');
const outDir = outIndex !== -1 ? args[outIndex + 1] : 'src/content/blog';
const pagesOutDir = 'src/content/pages';

if (!inputPath) {
  console.error('Usage: npm run migrate:wxr -- <path-to-wxr.xml> [--pages] [--base-url <url>] [--out <dir>]');
  process.exit(1);
}

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

// WordPress headings often carry a manually-set id (e.g. <h2 id="what-is">)
// used as an in-page table-of-contents anchor target. Plain "## Heading"
// Markdown has no way to express that id, which would silently break every
// TOC link. Keep those headings as raw HTML (Markdown renderers pass block
// HTML through untouched) instead of converting them to "##" syntax.
turndown.addRule('headingWithId', {
  filter: (node) => /^H[1-6]$/.test(node.nodeName) && node.getAttribute && node.getAttribute('id'),
  replacement: (_content, node) => {
    const level = node.nodeName.charAt(1);
    const id = node.getAttribute('id');
    return `\n\n<h${level} id="${id}">${node.textContent.trim()}</h${level}>\n\n`;
  },
});

function slugify(input) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function toFrontmatter(fields) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((v) => yamlString(v)).join(', ')}]`);
    } else if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${yamlString(value)}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

function cleanHtml(html) {
  if (!baseUrl) return html;
  return html.split(baseUrl).join('');
}

async function main() {
  const xml = await readFile(inputPath, 'utf-8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    // WordPress export wraps HTML/text in CDATA — fast-xml-parser unwraps
    // CDATA into plain text nodes by default, which is what we want.
  });
  const doc = parser.parse(xml);

  const items = doc?.rss?.channel?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  if (list.length === 0) {
    console.error('No <item> entries found — is this a valid WXR export file?');
    process.exit(1);
  }

  let postCount = 0;
  let pageCount = 0;
  let skipped = 0;

  for (const item of list) {
    const postType = item['wp:post_type'];
    if (postType !== 'post' && !(postType === 'page' && includePages)) {
      continue;
    }

    const status = item['wp:status'];
    const title = typeof item.title === 'string' ? item.title : (item.title?.['#text'] ?? '(untitled)');
    const wpSlug = item['wp:post_name'] || slugify(title);
    const slug = slugify(wpSlug || title);
    const pubDateRaw = item['wp:post_date'] || item.pubDate;
    const pubDate = pubDateRaw ? new Date(pubDateRaw).toISOString().slice(0, 10) : undefined;
    const author = item['dc:creator'];

    const rawContent = item['content:encoded'] ?? '';
    const contentHtml = cleanHtml(typeof rawContent === 'string' ? rawContent : String(rawContent));
    const markdownBody = turndown.turndown(contentHtml);

    const rawExcerpt = item['excerpt:encoded'];
    const description = typeof rawExcerpt === 'string' ? rawExcerpt.trim() : undefined;

    const categories = item.category;
    const catList = Array.isArray(categories) ? categories : categories ? [categories] : [];
    const tags = catList
      .filter((c) => c?.['@_domain'] === 'post_tag' || c?.['@_domain'] === 'category')
      .map((c) => (typeof c === 'string' ? c : c['#text']))
      .filter(Boolean);

    const frontmatter = toFrontmatter({
      title,
      description,
      pubDate,
      author,
      tags,
      wpSlug,
      draft: status !== 'publish',
    });

    const targetDir = postType === 'page' ? pagesOutDir : outDir;
    await mkdir(targetDir, { recursive: true });
    const filePath = path.join(targetDir, `${slug}.md`);
    await writeFile(filePath, frontmatter + markdownBody + '\n', 'utf-8');

    if (postType === 'page') pageCount++;
    else postCount++;
  }

  console.log(`Wrote ${postCount} post(s) to ${outDir}${includePages ? ` and ${pageCount} page(s) to ${pagesOutDir}` : ''}.`);
  if (skipped) console.log(`Skipped ${skipped} item(s).`);
  console.log('\nNext steps:');
  console.log('  1. Review the generated Markdown for conversion artifacts.');
  console.log('  2. Download referenced images from your WordPress media library into public/, then fix image paths.');
  console.log('  3. Delete the placeholder post at src/content/blog/welcome-to-your-new-site.md.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
