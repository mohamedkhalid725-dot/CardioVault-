import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

let installed = false;

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
};

export function installPdfDownloadBridge() {
  if (installed || !Capacitor.isNativePlatform() || typeof HTMLAnchorElement === 'undefined') return;
  installed = true;

  const pending = new Set<string>();
  const originalRevoke = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = (url: string) => {
    if (pending.has(url)) {
      // jsPDF commonly revokes the object URL immediately after anchor.click().
      // Keep it alive long enough for our native filesystem copy to finish.
      window.setTimeout(() => originalRevoke(url), 15000);
      return;
    }
    originalRevoke(url);
  };

  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function(this: HTMLAnchorElement) {
    const href = this.href || '';
    const filename = this.download || '';
    if (filename.toLowerCase().endsWith('.pdf') && href.startsWith('blob:')) {
      pending.add(href);
      void (async () => {
        try {
          const response = await fetch(href);
          if (!response.ok) throw new Error(`Unable to read generated PDF (${response.status}).`);
          const blob = await response.blob();
          const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
          const base64 = await blobToBase64(blob);
          await Filesystem.writeFile({
            path: `CardioVault/${safeName}`,
            data: base64,
            directory: Directory.Documents,
            recursive: true,
          });
          window.dispatchEvent(new CustomEvent('cardiovault:pdf-saved', {
            detail: { filename: safeName, path: `Documents/CardioVault/${safeName}` },
          }));
        } catch (error) {
          console.error('CardioVault PDF save failed:', error);
          // Preserve the browser/native download fallback if filesystem persistence fails.
          originalClick.call(this);
        } finally {
          pending.delete(href);
          window.setTimeout(() => originalRevoke(href), 1000);
        }
      })();
      return;
    }
    originalClick.call(this);
  };
}
