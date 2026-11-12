# KVARA AI

KVARA AI is a responsive AI workspace built with React, TypeScript, Vite, and a Cloudflare Worker backend.

## Included in this repository
- Email/password registration and login with hashed passwords and secure session cookies
- D1-backed chat history, create, load, rename-ready API, and delete-ready API
- Real text inference through Cloudflare Workers AI
- Image generation through Cloudflare Workers AI Flux
- Optional web search through Tavily
- Optional video generation through Replicate
- Text-to-speech using the browser speech synthesis engine
- Responsive interface for mobile and desktop

## Important limitations
This is a working foundation, not a claim of complete ChatGPT feature parity. AI usage is subject to Cloudflare/provider quotas and policies. Video generation requires a separately configured provider and may cost money. Unlimited usage cannot be guaranteed. File upload/analysis, image understanding, full duplex voice, email verification, password recovery, and social login are not implemented yet.

## Setup
1. Install Node.js 20+.
2. Run `npm install`.
3. Create a Cloudflare D1 database named `kvara-ai-db` and an R2 bucket named `kvara-ai-files`.
4. Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in `wrangler.toml` with the D1 database ID.
5. Apply the schema: `npx wrangler d1 migrations apply kvara-ai-db --remote`.
6. Enable Workers AI for the Cloudflare account.
7. Run locally with `npm run dev` for the frontend. For backend testing/deployment, use Wrangler.
8. Build and deploy with `npm run deploy`.

## Optional provider secrets
- `TAVILY_API_KEY` enables web search.
- `REPLICATE_API_TOKEN` and `REPLICATE_VIDEO_MODEL_VERSION` enable video prediction requests. Configure a Replicate model version that accepts a `prompt` input.

Set secrets with `npx wrangler secret put TAVILY_API_KEY`, `npx wrangler secret put REPLICATE_API_TOKEN`, and `npx wrangler secret put REPLICATE_VIDEO_MODEL_VERSION`.

## Security notes
- Never put provider API keys in frontend code.
- Use HTTPS in production.
- Configure rate limits, abuse prevention, account recovery, and privacy/retention policies before public launch.
- The app uses cookies with HttpOnly, Secure, and SameSite=Lax attributes.
