import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  // Load Markdown and MDX files in the `src/content/blog/` directory.
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),

      // dates
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),

      // cover image for card/detail
      heroImage: image().optional(),

      // bilingual + routing metadata
      lang: z.enum(["vi", "en"]).default("vi"),
      slug: z.string().optional(),

      // optional taxonomy
      tags: z.array(z.string()).default([]),
    }),
});

export const collections = { blog };
