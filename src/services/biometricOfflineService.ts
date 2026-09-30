import { Capacitor } from '@capacitor/core';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

const PIN_KEY = 'cardiovault_offline_pin_v1';

export const isNativeBiometricAvailable = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const result = await BiometricAuth.checkBiometry();
    return !!result.isAvailable;
  } catch {
    return false;
  }
};

export const enableBiometricOfflineUnlock = async (pin: string): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;
  if (!/^\\d{4,8}$/.test(pin)) return false;
  try {
    await SecureStorage.set(PIN_KEY, pin);
    return true;
  } catch (error) {
    console.warn('Could not store offline biometric credential:', error);
    return false;
  }
};

export const disableBiometricOfflineUnlock = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await SecureStorage.remove(PIN_KEY);
  } catch (error) {
    console.warn('Could not remove offline biometric credential:', error);
  }
};

export const authenticateBiometricOffline = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const stored = await SecureStorage.get(PIN_KEY);
    const pin = typeof stored === 'string' ? stored : String(stored ?? '');
    if (!/^\\d{4,8}$/.test(pin)) return false;
    await BiometricAuth.authenticate({
      reason: 'Confirm your identity to unlock CardioVault offline',
      cancelTitle: 'Use PIN',
      allowDeviceCredential: true,
      androidTitle: 'Unlock CardioVault',
      androidSubtitle: 'Biometric authentication is required to open the encrypted offline cache.',
      androidConfirmationRequired: false,
    });
    return true;
  } catch (error) {
    console.warn('Offline biometric authentication failed:', error);
    return false;
  }
};

export const getStoredBiometricOfflinePin = async (): Promise<string | null> => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const stored = await SecureStorage.get(PIN_KEY);
    const pin = typeof stored === 'string' ? stored : String(stored ?? '');
    return /^\\d{4,8}$/.test(pin) ? pin : null;
  } catch {
    return null;
  }
};
