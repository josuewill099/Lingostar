import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().optional(),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    // Set when a post needs to keep its original WordPress URL for redirects.
    wpSlug: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const pages = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date().optional(),
    author: z.string().optional(),
    tags: z.array(z.string()).default([]),
    wpSlug: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

// French translations of `blog`/`pages`. Slugs match their English
// counterpart on purpose (french-pronunciation.md exists in both blog/ and
// blog-fr/) so the hreflang pair can be computed from the slug alone,
// without a separate cross-reference field.
const blogFr = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().optional(),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const pagesFr = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date().optional(),
    author: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

// Spanish verb conjugation data (pSEO pipeline) — one JSON file per verb,
// built from the Jehle verb database. See scripts/build_verbs.mjs.
const verbs = defineCollection({
  type: 'data',
  schema: z.object({
    infinitive: z.string(),
    english: z.string(),
    gerund: z.string(),
    past_participle: z.string(),
    verb_class: z.string(),
    moods: z.record(z.record(z.object({
      tense_es: z.string(),
      english_gloss: z.string(),
      forms: z.array(z.string()),
    }))),
    irregular_tenses: z.array(z.string()),
    is_irregular: z.boolean(),
    frequency_rank: z.number(),
    related: z.array(z.string()),
    slug: z.string(),
    // In-page conjugation drill (2-3 questions), precomputed in
    // scripts/build_verbs.mjs. See buildDrill() there for selection logic.
    drill: z.array(z.object({
      tense: z.string(),
      tenseEs: z.string(),
      personIndex: z.number(),
      answer: z.string(),
      note: z.string(),
    })),
  }),
});

export const collections = { blog, pages, blogFr, pagesFr, verbs };
