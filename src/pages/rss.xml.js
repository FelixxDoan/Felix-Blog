import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';

export async function GET(context) {
	const posts = await getCollection('blog');
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
			items: posts.map((post) => {
				// Manually construct the link to avoid build errors with complex nested template literals in Vite/Rollup
				// The original code used a nested template literal which failed to parse during the build process.
				const slug = post.data.slug ?? post.id.replace(new RegExp(`^${post.data.lang}/`), '');
				return {
					...post.data,
					link: `/${post.data.lang}/blog/${slug}/`,
				};
			}),
	});
}
