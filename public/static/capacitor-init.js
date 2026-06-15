// Capacitor Native Initialization
// This file is loaded in the iOS app to configure native features.
// On the web, the Capacitor object won't exist and this is a no-op.

(function() {
  'use strict';

  // Detect if running inside Capacitor native shell
  var isNative = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
  
  // Mark the body so CSS can target native vs web
  if (isNative) {
    document.documentElement.classList.add('capacitor-native');
    document.documentElement.classList.add('platform-' + window.Capacitor.getPlatform());
  }

  // Only run plugin setup if inside Capacitor
  if (!isNative) return;

  console.log('[Capacitor] Running natively on', window.Capacitor.getPlatform());

  // Status bar — light content for dark nav bar
  if (window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar) {
    var StatusBar = window.Capacitor.Plugins.StatusBar;
    StatusBar.setStyle({ style: 'LIGHT' }).catch(function() {});
    StatusBar.setBackgroundColor({ color: '#0F172A' }).catch(function() {});
  }

  // Splash screen — hide after app is ready
  if (window.Capacitor.Plugins && window.Capacitor.Plugins.SplashScreen) {
    window.Capacitor.Plugins.SplashScreen.hide().catch(function() {});
  }

  // Back button handling (Android, but doesn't hurt on iOS)
  if (window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('backButton', function(ev) {
      // If we can go back in browser history, do that
      if (window.history.length > 1) {
        window.history.back();
      } else {
        // Otherwise minimize the app (don't exit)
        window.Capacitor.Plugins.App.minimizeApp();
      }
    });
  }

  // Haptic feedback helper — accessible globally
  window.bfHaptic = function(type) {
    if (!window.Capacitor.Plugins || !window.Capacitor.Plugins.Haptics) return;
    var Haptics = window.Capacitor.Plugins.Haptics;
    switch (type) {
      case 'light': Haptics.impact({ style: 'LIGHT' }); break;
      case 'medium': Haptics.impact({ style: 'MEDIUM' }); break;
      case 'heavy': Haptics.impact({ style: 'HEAVY' }); break;
      case 'success': Haptics.notification({ type: 'SUCCESS' }); break;
      case 'warning': Haptics.notification({ type: 'WARNING' }); break;
      case 'error': Haptics.notification({ type: 'ERROR' }); break;
      default: Haptics.impact({ style: 'LIGHT' }); break;
    }
  };
})();
