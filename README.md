# KVARA AI

KVARA AI is a responsive AI workspace built with React, TypeScript, Vite, Cloudflare Workers AI, D1, and R2.

## Features
- Email/password registration and secure session cookies
- AI chat with saved conversation history, rename, delete, and export
- Browser voice input with language selection and improved final-transcript handling
- Text-to-speech with selectable installed voices, speed control, and automatic reply reading
- Image generation through Cloudflare Workers AI Flux
- Roblox Luau script generation
- Private text-file upload, listing, analysis, and deletion
- Optional web search through Tavily
- Quick prompt tools for summarizing, translating, explaining, code review, brainstorming, and study help
- Settings for theme, speech language, voice, playback speed, and chat export
- Authenticated MCP Streamable HTTP endpoint exposing KVARA chat, web search, chat history, and file listing

Video Studio and Replicate video-generation routes have been removed.

## MCP connection
1. Sign in to KVARA AI and open **MCP & Connectors**.
2. Generate an MCP token. Copy it immediately; it is only displayed once.
3. Configure an MCP-compatible client with the endpoint `https://kvara-global.kvaraai.workers.dev/mcp`.
4. Use HTTP Bearer authentication with the generated token.
5. Revoke or rotate the token from the same page if it is exposed.

Available MCP tools: `kvara_chat`, `kvara_web_search`, `kvara_list_chats`, `kvara_read_chat`, and `kvara_list_files`.

The MCP endpoint uses the Streamable HTTP JSON-RPC transport. Keep the bearer token private. Web search requires `TAVILY_API_KEY` in Cloudflare Worker secrets.

## Setup
1. Install Node.js 20+.
2. Run `npm install`.
3. Create the Cloudflare D1 database and R2 bucket used by `wrangler.toml`.
4. Apply all D1 migrations: `npx wrangler d1 migrations apply kvara-ai-db --remote`.
5. Enable Workers AI for the Cloudflare account.
6. Configure optional `TAVILY_API_KEY` as a Worker secret to enable web search.
7. Build and deploy with `npm run deploy`.

## Limitations
This is not a complete clone of ChatGPT. External connectors such as Gmail, Google Drive, GitHub, and Discord still require their own OAuth/API authorization and implementation. Browser speech recognition depends on device, browser, microphone permission, and language availability. AI requests are subject to provider quotas and safety policies.

## Security
- Provider API keys and MCP tokens must never be placed in frontend source code.
- MCP tokens are stored as hashes and can be revoked or rotated.
- Use HTTPS and configure rate limits and abuse prevention before broad public launch.
- Do not share MCP bearer tokens in screenshots, public repositories, or chats.
