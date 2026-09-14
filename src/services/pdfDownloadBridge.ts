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
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function(this: HTMLAnchorElement) {
    const href = this.href || '';
    const filename = this.download || '';
    if (filename.toLowerCase().endsWith('.pdf') && href.startsWith('blob:')) {
      void (async () => {
        try {
          const response = await fetch(href);
          const blob = await response.blob();
          const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
          await Filesystem.writeFile({
            path: `CardioVault/${safeName}`,
            data: await blobToBase64(blob),
            directory: Directory.Documents,
            recursive: true,
          });
          window.dispatchEvent(new CustomEvent('cardiovault:pdf-saved', { detail: { filename: safeName } }));
        } catch (error) {
          console.error('CardioVault PDF save failed:', error);
          originalClick.call(this);
        }
      })();
      return;
    }
    originalClick.call(this);
  };
}
