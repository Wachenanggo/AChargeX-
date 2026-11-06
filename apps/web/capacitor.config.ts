import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native wrapper config. Generate native projects with:
 *   npm run cap:android   (or let .github/workflows/android.yml do it in CI)
 *   npm run cap:ios       (or let codemagic.yaml do it on a cloud Mac)
 * Then: npm run cap:sync
 */
const config: CapacitorConfig = {
  appId: 'ph.achargex.go',
  appName: 'AChargeX',
  webDir: 'dist',
  backgroundColor: '#F4F9F6',
  ios: { contentInset: 'never' },
  android: { allowMixedContent: false },
};

export default config;
