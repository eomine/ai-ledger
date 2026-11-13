import { mergeConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import viteConfig from './vite.config.ts';

export default mergeConfig(viteConfig, {
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [
        { browser: 'chromium' }, // Must have at least one instance
      ],
    },
  },
});
