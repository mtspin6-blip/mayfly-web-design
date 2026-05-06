import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://mayflywebdesign.com',
  integrations: [
    tailwind({ applyBaseStyles: false }),
  ],
});
