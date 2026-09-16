# CardioVault AI Backend

CardioVault no longer sends a Gemini API key from the Android/web client. AI requests are authenticated with the user's Firebase Auth ID token and handled by the Firebase Cloud Function `analyzeClinicalPatient`.

Google recommends keeping Gemini API keys server-side for production applications and using a backend proxy rather than exposing a key in a web or mobile client.

## One-time Firebase setup

From the repository root:

```bash
npm install -g firebase-tools
firebase login
firebase use ccu-notebook
firebase functions:secrets:set GEMINI_API_KEY
firebase deploy --only functions:analyzeClinicalPatient
```

When `firebase functions:secrets:set GEMINI_API_KEY` asks for the value, paste the Gemini API key from Google AI Studio. Do not commit the value to Git and do not put it in the Vite client environment.

The function URL is:

`https://us-central1-ccu-notebook.cloudfunctions.net/analyzeClinicalPatient`

The Android app already uses this URL by default, so no per-device AI key configuration is required after the function is deployed.

## Security model

1. User signs in with Firebase Authentication.
2. CardioVault obtains the short-lived Firebase ID token.
3. The app sends the patient record to the authenticated Cloud Function over HTTPS.
4. The function verifies the Firebase ID token before calling Gemini.
5. The Gemini API key exists only in Firebase Secret Manager and is injected only into this function.
6. The function returns the structured AI result and does not save the patient record as an AI record.

The AI output remains clinical decision support and must be verified by the treating clinician.

## Important

Cloud Functions and Secret Manager may require a Firebase/Google Cloud billing setup depending on the project and usage. Gemini usage is charged/quotaed against the server-side Google AI project associated with the key.
