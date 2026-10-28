import './services/pdfArabicSupport';
import './services/bedReconciliation';
import {installPdfDownloadBridge} from './services/pdfDownloadBridge';
import {initializeCardioVaultAppCheck} from './services/aiLogic';
import {isLocalPreview} from './config/localPreview';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

installPdfDownloadBridge();
// App Check is a cloud-bound service: skip it entirely in the isolated local preview.
if (!isLocalPreview()) void initializeCardioVaultAppCheck().catch(() => undefined);


createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
