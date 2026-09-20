import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const CHANNEL_ID = 'clinical-updates';
let initialized = false;
let permissionGranted = false;

export async function initializeClinicalNotifications(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (initialized) return permissionGranted;

  try {
    const permission = await LocalNotifications.requestPermissions();
    permissionGranted = permission.display === 'granted';

    if (permissionGranted && Capacitor.getPlatform() === 'android') {
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'Clinical Data Updates',
        description: 'Notifications when clinical data is added or updated in CardioVault.',
        importance: 4,
        visibility: 1,
        sound: undefined,
        vibration: true,
      });
    }

    initialized = true;
    return permissionGranted;
  } catch (error) {
    console.warn('Clinical notifications initialization failed:', error);
    initialized = true;
    return false;
  }
}

export async function notifyClinicalData(
  message: string,
  title = 'CardioVault'
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const ready = await initializeClinicalNotifications();
    if (!ready) return;

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 2147483647),
          title,
          body: message,
          channelId: CHANNEL_ID,
          schedule: { at: new Date(Date.now() + 250) },
          extra: { type: 'clinical-data-update' },
        },
      ],
    });
  } catch (error) {
    console.warn('Clinical notification failed:', error);
  }
}
