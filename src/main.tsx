import './services/pdfArabicSupport';
import './services/bedReconciliation';
import {installPdfDownloadBridge} from './services/pdfDownloadBridge';
import {initializeCardioVaultAppCheck} from './services/aiLogic';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

installPdfDownloadBridge();
void initializeCardioVaultAppCheck().catch(() => undefined);

const previewAppCheckSkipped =
  import.meta.env.VITE_AI_APPCHECK_SKIP === 'true' &&
  import.meta.env.VITE_CARDIOVAULT_PREVIEW === 'true';

const PreviewAppCheckBanner = () => previewAppCheckSkipped ? (
  <div
    role="status"
    className="fixed top-0 left-0 right-0 z-[9999] px-3 py-2 text-center text-xs font-extrabold bg-amber-100 text-amber-950 border-b border-amber-300"
  >
    App Check skipped - test only
  </div>
) : null;

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PreviewAppCheckBanner />
    <App />
  </React.StrictMode>,
);
