// Android-only voice path: sends recorded audio to the Cloudflare Worker
// proxy (which verifies the Firebase ID token server-side and calls
// Gemini with a server key). Web NEVER uses this module — web keeps
// transcribeMedicalVoice (Firebase AI Logic) exactly as is.
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

export interface ProxyResult {
  raw_transcript: string;
  clean_english: string;
  uncertain: string[];
  warnings: string[];
}

export type ProxyErrorCode =
  | 'proxy_not_configured'
  | 'sign_in_again'
  | 'quota_will_retry'
  | 'saved_will_retry'
  | 'unintelligible'
  | 'proxy_failed';

export class VoiceProxyError extends Error {
  readonly code: ProxyErrorCode;
  constructor(code: ProxyErrorCode, message: string) {
    super(message);
    this.name = 'VoiceProxyError';
    this.code = code;
  }
}

export function isAndroidProxyPath(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export function proxyErrorMessage(code: ProxyErrorCode): string {
  switch (code) {
    case 'sign_in_again':
      return 'You are not signed in. Please sign in again, then retry voice transcription.';
    case 'quota_will_retry':
      return 'Voice service is busy (quota). Your recording is saved and will retry.';
    case 'saved_will_retry':
      return 'Connection failed. Your recording is saved and will retry.';
    case 'unintelligible':
      return 'No clear speech was recognized. Please try again with a clearer recording.';
    case 'proxy_not_configured':
      return 'Voice proxy is not configured on this build. Please update the app.';
    default:
      return 'Voice transcription failed. Please try again.';
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the recording.'));
    reader.onload = () => {
      const value = String(reader.result || '');
      resolve(value.includes(',') ? value.split(',').pop() || '' : value);
    };
    reader.readAsDataURL(blob);
  });
}

export async function transcribeViaProxy(audio: Blob, fieldName: string): Promise<ProxyResult> {
  const baseUrl = String(import.meta.env.VITE_VOICE_PROXY_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (!baseUrl) throw new VoiceProxyError('proxy_not_configured', proxyErrorMessage('proxy_not_configured'));

  const audioBase64 = await blobToBase64(audio);
  if (!audioBase64) throw new VoiceProxyError('unintelligible', proxyErrorMessage('unintelligible'));

  // One attempt: fresh-token flag controls Firebase token refresh.
  const attempt = async (forceRefresh: boolean): Promise<Response> => {
    let idToken = '';
    try {
      const { token } = await FirebaseAuthentication.getIdToken({ forceRefresh });
      idToken = String(token || '');
    } catch {
      throw new VoiceProxyError('sign_in_again', proxyErrorMessage('sign_in_again'));
    }
    if (!idToken) throw new VoiceProxyError('sign_in_again', proxyErrorMessage('sign_in_again'));
    try {
      return await fetch(`${baseUrl}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          audioBase64,
          mimeType: audio.type || 'audio/aac',
          fieldName: fieldName || 'clinical field',
        }),
      });
    } catch {
      throw new VoiceProxyError('saved_will_retry', proxyErrorMessage('saved_will_retry'));
    }
  };

  // On 401, retry ONCE with a force-refreshed token (stale cached token is
  // the common transient cause) before failing.
  let res: Response;
  try {
    res = await attempt(false);
    if (res.status === 401) res = await attempt(true);
  } catch (error) {
    if (error instanceof VoiceProxyError && error.code === 'sign_in_again') {
      try {
        res = await attempt(true);
      } catch (retryError) {
        throw retryError;
      }
    } else throw error;
  }
  if (res.status === 401) throw new VoiceProxyError('sign_in_again', proxyErrorMessage('sign_in_again'));
  if (res.status === 429) throw new VoiceProxyError('quota_will_retry', proxyErrorMessage('quota_will_retry'));
  if (res.status === 502 || res.status === 503) {
    throw new VoiceProxyError('saved_will_retry', proxyErrorMessage('saved_will_retry'));
  }
  if (!res.ok) throw new VoiceProxyError('proxy_failed', proxyErrorMessage('proxy_failed'));

  let value: Partial<ProxyResult>;
  try {
    value = (await res.json()) as Partial<ProxyResult>;
  } catch {
    throw new VoiceProxyError('proxy_failed', proxyErrorMessage('proxy_failed'));
  }
  const result: ProxyResult = {
    raw_transcript: typeof value.raw_transcript === 'string' ? value.raw_transcript : '',
    clean_english: typeof value.clean_english === 'string' ? value.clean_english : '',
    uncertain: Array.isArray(value.uncertain)
      ? value.uncertain.filter((u): u is string => typeof u === 'string')
      : [],
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((w): w is string => typeof w === 'string')
      : [],
  };
  if (!result.raw_transcript && !result.clean_english) {
    throw new VoiceProxyError('unintelligible', proxyErrorMessage('unintelligible'));
  }
  return result;
}
