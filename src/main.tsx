import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {installPdfDownloadBridge} from './services/pdfDownloadBridge';
import {installCloudSyncBridge} from './services/cloudSyncBridge';

installPdfDownloadBridge();
installCloudSyncBridge();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
