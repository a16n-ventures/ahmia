import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ahmia.app',
  appName: 'ahmia',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;