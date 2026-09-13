import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://mayflywebdesign.com',
  // Stylesheets are small; inlining removes render-blocking round trips.
  build: { inlineStylesheets: 'always' },
  integrations: [
    tailwind({ applyBaseStyles: false }),
  ],
});
