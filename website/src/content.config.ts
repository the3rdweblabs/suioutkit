import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

/**
 * Single source of truth: repository root `docs/`.
 * Edit markdown there; the site at website/ renders it at /docs/*.
 */
const docs = defineCollection({
  loader: glob({
    base: "../docs",
    pattern: [
      "getting-started/**/*.md",
      "guides/**/*.md",
      "developer-guide.md",
      "hosted-api.md",
    ],
  }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

export const collections = { docs };
