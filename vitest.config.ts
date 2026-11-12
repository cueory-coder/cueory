/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// getViteConfig adds Astro's Vite plugin so unit tests can render .astro components with the Container API.
export default getViteConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
