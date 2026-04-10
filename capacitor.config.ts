import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vocalflow.app',
  appName: 'VocalFlow',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: false
  }
};

export default config;
