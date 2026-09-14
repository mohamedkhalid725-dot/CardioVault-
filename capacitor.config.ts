import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cardiovault.app',
  appName: 'CardioVault',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
