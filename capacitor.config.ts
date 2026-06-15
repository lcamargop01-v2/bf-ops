import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.britishfeed.ops',
  appName: 'BF Ops',
  webDir: 'dist',
  
  // Server configuration — loads from production URL
  // Comment out the 'server' block below to use bundled local assets instead
  server: {
    url: 'https://bf-ops.pages.dev',
    cleartext: false,
  },

  ios: {
    // Use WKWebView (default, best performance)
    contentInset: 'automatic',
    backgroundColor: '#0F172A',
    preferredContentMode: 'mobile',
    scheme: 'bf-ops',
    // Allow navigation to the production server
    allowsLinkPreview: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0F172A',
      showSpinner: false,
      launchFadeOutDuration: 300,
    },
    StatusBar: {
      style: 'LIGHT',        // Light text for dark background
      backgroundColor: '#0F172A',
    },
    Keyboard: {
      resize: 'body',        // Resize viewport when keyboard shows
      resizeOnFullScreen: true,
    },
  },
};

export default config;
