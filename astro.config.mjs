import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// SSR (matches the portal) so we can run the /api/intake endpoint and render
// dynamic pages. checkOrigin off for the DO App Platform proxy.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  security: { checkOrigin: false },
  site: 'https://www.unakin.com',
});
