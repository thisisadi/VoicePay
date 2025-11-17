# VoicePay

Short overview
--------------
VoicePay is a voice-enabled, web3-first payments app that lets users create one-time and recurring on-chain payments via a friendly Next.js frontend and a Node/Express backend. The system uses a Cloudflare Worker (with Durable Objects and KV) as the scheduling and state layer for recipients, schedules, and transactions, and an Ethereum smart contract for recurring pull payments.

High-level architecture
-----------------------
- Frontend (`VoicePayFrontend`): Next.js (App Router) React UI that authenticates users via wallet signature, stores a JWT locally, and interacts with the backend to manage recipients, intents, and recurring setup. Uses `wagmi`, `viem`, and `ethers` for wallet/connect and on-chain interactions.
- Backend (`VoicePayBackend`): Express server exposing REST endpoints (`/auth`, `/recipients`, `/intent`, `/transactions`). Responsible for JWT issuance/verification, forwarding schedule creation to the Cloudflare Worker, and executing recurring payments via a server-side executor wallet (calls the recurring contract).
- Cloudflare Worker (`VoicePayBackend/cloudflare/voicepay-worker`): Durable Objects store per-user data (recipients, schedules, transactions) and a cron-style scheduler that executes due recurring payments; it signs requests to the backend using HMAC and writes transaction logs back into the DO.
- Smart Contract (`VoicePayBackend/recurring-contract`): Hardhat project containing `RecurringPull.sol` (pull-payment style contract used by the backend executor wallet to pull tokens with prior approval).

Key components & design choices
-------------------------------
- Authentication: Wallet-based sign-in (nonce -> personal_sign) on the worker DO, verified by the backend which issues a short-lived JWT (`JWT_SECRET`).
- Worker ↔ Backend trust: Worker signs backend requests with HMAC (`WORKER_SHARED_SECRET`) and backend validates via `workerAuth` middleware (prevents replay using timestamps).
- Scheduling & state: Durable Objects store canonical user state and schedules. Worker keeps an index (KV `SCHEDULE_KV`) for scanning due schedules.
- Recurring payments: Backend's protected route `/process-recurring` (signed by worker) uses an executor private key to call `pullPayment` on the recurring contract. The contract address is configured via `RECURRING_CONTRACT` env var.
- Intent parsing: Cloudflare Worker uses an AI assistant (Mistral) to parse natural language to structured payment intent JSON (see `parseIntent` in worker). This allows voice/natural language input to produce structured transactions.

Environment variables (used across the repo)
------------------------------------------
- `PORT` — backend listen port (used by `server.js`)
- `NEXT_PUBLIC_BACKEND_URL` — frontend -> backend base URL
- `CF_WORKER_URL` — Cloudflare Worker base URL used by backend
- `WORKER_SHARED_SECRET` — shared secret for HMAC (worker ↔ backend)
- `JWT_SECRET` — secret for signing JWTs
- `RECURRING_CONTRACT` — deployed contract address for recurring pull payments
- `EXECUTOR_PRIVATE_KEY` — private key used by backend to call the contract
- `RPC_URL` — JSON-RPC node endpoint for backend `ethers` provider
- `USDC_ADDRESS` — token address used for payments (optional fallback)

How data flows (high level)
---------------------------
1. User connects wallet in the Next.js frontend. Frontend calls backend `/auth/nonce` and `/auth/verify` to obtain a JWT.
2. User creates intents (via voice or text).
	- If the user speaks, the frontend records audio and sends it to ElevenLabs' speech-to-text API (configured via `NEXT_PUBLIC_ELEVENLABS_API_URL` / `NEXT_PUBLIC_ELEVENLABS_API_KEY`) to obtain a transcription.
	- The frontend then sends the transcribed text to the backend `/intent/parse-intent` endpoint. The backend forwards the text to the Cloudflare Worker which runs the AI parsing (`parseIntent`) to produce a structured payment intent JSON. The Worker may then update the user's Durable Object (recipients, schedules) as needed.
3. For recurring payments, frontend calls backend `/transactions/setup-recurring` which forwards a create-schedule request to the Worker; Worker stores the schedule in DO and writes an index entry to KV for scheduling.
4. Cron or scheduled logic in Worker scans `SCHEDULE_KV` and when a schedule is due, the Worker calls the backend `/transactions/process-recurring` using HMAC-signed request headers. Backend validates and executes `pullPayment` on-chain via the executor wallet.
5. Execution results are logged back into the DO (via `store-transaction`) so the user can view history.


Running the project (local dev)
--------------------------------
Note: these are minimal commands — confirm your Node.js version (recommend Node 18+). Adjust ports and env vars as needed. The frontend requires a few `NEXT_PUBLIC_*` environment variables (listed below) so the UI can call the backend, the ElevenLabs transcription API, and the testnet RPC.

1) Frontend
```bash
cd VoicePayFrontend
# Example (zsh) - set the env vars before running dev server
export NEXT_PUBLIC_BACKEND_URL="http://localhost:3001"
export NEXT_PUBLIC_ARC_RPC_URL="https://rpc.testnet.arc.network"
export NEXT_PUBLIC_USDC_ADDRESS="0xYourUSDCAddress"
export NEXT_PUBLIC_USDC_DECIMALS="6"
export NEXT_PUBLIC_ELEVENLABS_API_URL="https://api.elevenlabs.io/v1/speech-to-text"
export NEXT_PUBLIC_ELEVENLABS_API_KEY="your_elevenlabs_key"


npm run dev
```
Open `http://localhost:3000` (default Next.js port).

2) Backend
```bash
cd VoicePayBackend
npm install
# export env vars, for example (zsh):
export PORT=3001
export JWT_SECRET=your_jwt_secret
export CF_WORKER_URL=http://localhost:8787
export WORKER_SHARED_SECRET=some_shared_secret
export RECURRING_CONTRACT=0x...
export EXECUTOR_PRIVATE_KEY=0x...
export RPC_URL=https://your-rpc
export USDC_ADDRESS=0xYourUSDCAddress

node server.js
```

3) Cloudflare Worker (local testing / dev)
- The Worker resides in `VoicePayBackend/cloudflare/voicepay-worker`. It includes Durable Object code and expects to be deployed with Wrangler. See `wrangler.jsonc` in that folder.
- For local testing you can use `wrangler dev` or deploy to Cloudflare with `wrangler publish` after setting the required secrets and DO bindings. Be sure to set `WORKER_SHARED_SECRET`, `RECURRING_CONTRACT`, and any DO bindings used by the worker.

4) Smart contract (Hardhat)
```bash
cd VoicePayBackend/recurring-contract
npm install
# Use hardhat to compile/deploy/test
npx hardhat compile
# deploy scripts are in `scripts/deploy.js` (adjust network config in `hardhat.config.js`)
```