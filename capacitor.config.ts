/// <reference types="@capacitor-firebase/authentication" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cardiovault.app',
  appName: 'CardioVault',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    FirebaseAuthentication: {
      providers: ['google.com'],
      skipNativeAuth: false,
    },
    // Use Capacitor's native HTTP stack for Firebase Storage REST uploads.
    // This avoids WebView CORS/network failures such as "Failed to fetch".
    CapacitorHttp: {
      enabled: true,
    },
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      hidden: false,
    },
  },
};

export default config;
