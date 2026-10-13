# CardioVault voice proxy — manual deploy guide

Android-only backend: verifies the doctor's Firebase Auth ID token,
then sends the recorded audio to Gemini with a server-side key and
returns `{ raw_transcript, clean_english, uncertain, warnings }`.

The web app does NOT use this proxy (it uses Firebase AI Logic directly).

## One-time manual steps (owner runs these, never the agent)

1. Install tooling and log in (uses your own Cloudflare account):
   `cd voice-proxy && npm install && npx wrangler login`
2. Create the rate-limit KV namespace and paste its id into `wrangler.toml`:
   `npx wrangler kv:namespace create VOICE_RL`
3. Set the secrets (never commit these values anywhere):
   `npx wrangler secret put GEMINI_API_KEY`
   `npx wrangler secret put FIREBASE_PROJECT_ID`
   (Keep secrets OUT of wrangler.toml [vars]: a plain var shadows — and on
   deploy even deletes — a secret of the same name. GEMINI_MODEL and extra
   origins are configured as vars in wrangler.toml instead.)
4. Deploy:
   `npx wrangler deploy`
5. Copy the worker URL (`https://cardiovault-voice-proxy.<you>.workers.dev`)
   into the GitHub secret/variable `VITE_VOICE_PROXY_URL`, rebuild the APK,
   and test on a real phone with FAKE data only until the Gemini project is
   on a PAID tier (free tier may use data to improve models).

## Local checks (no deploy, no secrets)

- `npm run typecheck` — TypeScript check of `src/`.
- Tests run in the repo root suite (`npm run test:summary-input`);
  from here you can also run `npm test` after `npm install`.
