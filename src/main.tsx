import './services/pdfArabicSupport';
import './services/bedReconciliation';
import {installPdfDownloadBridge} from './services/pdfDownloadBridge';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

installPdfDownloadBridge();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
