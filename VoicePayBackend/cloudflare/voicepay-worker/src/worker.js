// worker.js — Cron-based scheduler + Durable Objects + HMAC-signed backend calls
import { ethers } from "ethers";

/* --------------------------
   Utility functions (top-level)
-------------------------- */

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function toIsoDateTime(start_date, time_of_day) {
    try {
        if (time_of_day) {
            return new Date(`${start_date}T${time_of_day}:00Z`).toISOString();
        }
        return new Date(`${start_date}T00:00:00Z`).toISOString();
    } catch {
        return new Date().toISOString();
    }
}

function incrementNextRunIso(isoString, interval, intervalMs) {
    const d = new Date(isoString);
    if (intervalMs && Number.isFinite(intervalMs)) {
        d.setTime(d.getTime() + Number(intervalMs));
        return d.toISOString();
    }
    switch (interval) {
        case "daily": d.setUTCDate(d.getUTCDate() + 1); break;
        case "weekly": d.setUTCDate(d.getUTCDate() + 7); break;
        case "monthly": d.setUTCMonth(d.getUTCMonth() + 1); break;
        case "yearly": d.setUTCFullYear(d.getUTCFullYear() + 1); break;
        default: d.setUTCDate(d.getUTCDate() + 1); break;
    }
    return d.toISOString();
}

/* --------------------------
   HMAC signing utility (Worker -> Backend)
---------------------------*/
async function signRequest(body, secret) {
    const timestamp = Date.now().toString();
    const encoder = new TextEncoder();
    const data = encoder.encode(timestamp + body);

    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign("HMAC", key, data);
    const signatureHex = [...new Uint8Array(signatureBuffer)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    return { signature: signatureHex, timestamp };
}

/* ---------------------------------------------------------
   Note: we keep DO data model, but we no longer use state.setAlarm
   Cron will drive execution by reading the KV index "SCHEDULE_KV".
---------------------------------------------------------*/

export class UserStore { }

/* ---------------------------------------------------------
   WalletDurableObject — per-user durable object
   - stores recipients, schedules, transactions inside state.storage.data
   - exposes fetch endpoints used by main worker / backend
   - NOTE: added /update-schedule and /delete-schedule endpoints so
     the cron job can keep DO state in sync after executing schedules
--------------------------------------------------------- */

export class WalletDurableObject {
    constructor(state, env) {
        this.state = state;
        this.env = env;
    }

    /* ------------- fetch endpoints ------------- */
    async fetch(request) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;
        const address = url.searchParams.get("address"); // callers should provide userAddress query param

        // Public endpoints handled by DO
        if (path === "/nonce" && method === "POST") {
            if (!address) return Response.json({ error: "Missing address" }, { status: 400 });
            return this.handleNonce(address);
        }
        if (path === "/verify" && method === "POST") {
            if (!address) return Response.json({ error: "Missing address" }, { status: 400 });
            const { signature } = await request.json();
            return this.handleVerify(address, signature);
        }

        if (path === "/recipients") {
            if (!address) return Response.json({ error: "Missing address" }, { status: 400 });
            if (method === "GET") return this.getRecipients();
            const body = await request.json();
            if (method === "POST") return this.addRecipient(body);
            if (method === "DELETE") return this.deleteRecipient(body);
            if (method === "PUT") return this.updateRecipient(body);
        }

        if (path === "/recipientByName" && method === "GET") {
            if (!address) return Response.json({ error: "Missing address" }, { status: 400 });
            const name = url.searchParams.get("name");
            if (!name) return Response.json({ error: "Missing recipient name" }, { status: 400 });
            return this.getRecipientByName(name);
        }

        if (path === "/transactions" && method === "GET") {
            if (!address) return Response.json({ error: "Missing address" }, { status: 400 });
            return this.getTransactions();
        }

        if (path === "/store-transaction" && method === "POST") {
            if (!address) return Response.json({ error: "Missing address" }, { status: 400 });
            const body = await request.json();
            return this.storeTransaction(body);
        }

        // create-schedule: called by backend /setup-recurring -> worker.create-schedule
        if (path === "/create-schedule" && method === "POST") {
            const body = await request.json();
            // minimal validation
            const { id, recipient, amount, start_date } = body;
            if (!recipient || !amount || !start_date) {
                return Response.json({ error: "Missing required schedule fields" }, { status: 400 });
            }
            // store canonical userAddress in meta if provided (helpful for later)
            const meta = (await this.state.storage.get("meta")) || {};
            if (!meta.userAddress && body.userAddress) {
                meta.userAddress = body.userAddress;
                await this.state.storage.put("meta", meta);
            }
            // Build schedule record (server may send a schedule object, but ensure default fields)
            const schedule = {
                id: body.id || uuidv4(),
                name: body.name || null,
                recipient: recipient,
                amount: Number(amount),
                currency: body.currency || "USDC",
                interval: body.interval || null,
                intervalMs: body.intervalMs || null,
                start_date: body.start_date,
                time_of_day: body.time_of_day || null,
                times: body.times ?? null,
                times_remaining: body.times ?? null,
                note: body.note || null,
                nextRun: body.nextRun || toIsoDateTime(body.start_date, body.time_of_day),
                created_at: new Date().toISOString(),
                active: true
            };
            const added = await this.addSchedule(schedule);
            return Response.json({ success: true, schedule: added });
        }

        // ---- New endpoints to allow external updater (cron) to sync DO state ----
        if (path === "/update-schedule" && method === "POST") {
            if (!address) return Response.json({ error: "Missing address" }, { status: 400 });
            const body = await request.json(); // { scheduleId, patch }
            const { scheduleId, patch } = body || {};
            if (!scheduleId || !patch) return Response.json({ error: "Missing scheduleId or patch" }, { status: 400 });
            try {
                const updated = await this.updateSchedule(scheduleId, patch);
                return Response.json({ success: true, schedule: updated });
            } catch (err) {
                return Response.json({ error: err.message || "update failed" }, { status: 500 });
            }
        }

        if (path === "/delete-schedule" && method === "POST") {
            if (!address) return Response.json({ error: "Missing address" }, { status: 400 });
            const body = await request.json(); // { scheduleId }
            const { scheduleId } = body || {};
            if (!scheduleId) return Response.json({ error: "Missing scheduleId" }, { status: 400 });
            try {
                const result = await this.deleteSchedule(scheduleId);
                return Response.json({ success: true, result });
            } catch (err) {
                return Response.json({ error: err.message || "delete failed" }, { status: 500 });
            }
        }

        if (path === "/schedules" && method === "GET") {
            const schedules = await this._getAllSchedules();
            return Response.json({ success: true, schedules });
        }

        return Response.json({ error: "Not found" }, { status: 404 });
    }

    /* -------------------------------
       Nonce/Verify helpers
    -------------------------------- */
    async handleNonce(address) {
        const nonce = Math.floor(Math.random() * 1_000_000).toString();
        const auth = (await this.state.storage.get("auth")) || {};
        auth.nonce = nonce;
        auth.updated_at = new Date().toISOString();
        await this.state.storage.put("auth", auth);
        return Response.json({ nonce });
    }

    async handleVerify(address, signature) {
        const auth = (await this.state.storage.get("auth")) || {};
        if (!auth || !auth.nonce) return Response.json({ error: "Nonce not found" }, { status: 400 });

        const message =
            `Welcome to VoicePay!\n\nTo securely sign in, please confirm this message.\n\nSecurity code: ${auth.nonce}\n\nThis signature will not trigger any blockchain transaction or gas fee.`;

        try {
            ethers.verifyMessage(message, signature);
        } catch (err) {
            console.error("verify signature error:", err);
            return Response.json({ error: "Invalid signature format" }, { status: 400 });
        }

        auth.nonce = null;
        await this.state.storage.put("auth", auth);
        return Response.json({ success: true });
    }

    /* -------------------------------
       Internal data helpers (single envelope 'data')
    -------------------------------- */
    async _getData() {
        const data = (await this.state.storage.get("data")) || { recipients: [], transactions: [], schedules: [] };
        data.recipients = data.recipients || [];
        data.transactions = data.transactions || [];
        data.schedules = data.schedules || [];
        return data;
    }
    async _putData(data) {
        await this.state.storage.put("data", data);
    }

    /* -------------------------------
       Recipients CRUD
    -------------------------------- */
    async getRecipients() {
        const data = await this._getData();
        return Response.json({ recipients: data.recipients });
    }

    async addRecipient({ name, wallet, note }) {
        if (!name || !wallet) return Response.json({ error: "Missing name or wallet" }, { status: 400 });
        const data = await this._getData();
        if (data.recipients.some(r => r.wallet.toLowerCase() === wallet.toLowerCase())) {
            return Response.json({ error: "Recipient already exists" }, { status: 409 });
        }
        data.recipients.push({ name, wallet, note: note || "" });
        await this._putData(data);
        return Response.json({ success: true, recipients: data.recipients });
    }

    async deleteRecipient({ wallet }) {
        if (!wallet) return Response.json({ error: "Missing wallet" }, { status: 400 });
        const data = await this._getData();
        data.recipients = (data.recipients || []).filter(r => r.wallet.toLowerCase() !== wallet.toLowerCase());
        await this._putData(data);
        return Response.json({ success: true, recipients: data.recipients });
    }

    async updateRecipient({ oldWallet, newWallet, newName, newNote }) {
        if (!oldWallet) return Response.json({ error: "Missing oldWallet" }, { status: 400 });
        const data = await this._getData();
        const idx = data.recipients.findIndex(r => r.wallet.toLowerCase() === oldWallet.toLowerCase());
        if (idx === -1) return Response.json({ error: "Recipient not found" }, { status: 404 });
        if (newWallet && data.recipients.some((r, i) => i !== idx && r.wallet.toLowerCase() === newWallet.toLowerCase())) {
            return Response.json({ error: "Recipient with new wallet already exists" }, { status: 409 });
        }
        if (newName) data.recipients[idx].name = newName;
        if (newWallet) data.recipients[idx].wallet = newWallet;
        if (newNote !== undefined) data.recipients[idx].note = newNote;
        await this._putData(data);
        return Response.json({ success: true, updated: data.recipients[idx], recipients: data.recipients });
    }

    async getRecipientByName(name) {
        const data = await this._getData();
        const recipients = data.recipients || [];
        const query = name.toLowerCase().trim();

        const exactMatches = recipients.filter(r => r.name.toLowerCase() === query);
        if (exactMatches.length === 1) {
            const r = exactMatches[0];
            return Response.json({ match_type: "exact", wallet: r.wallet, recipient: r.name, note: r.note || "" });
        }
        if (exactMatches.length > 1) {
            return Response.json({
                match_type: "ambiguous",
                message: `Multiple recipients are named '${name}'. Please specify.`,
                options: exactMatches.map(r => ({ name: r.name, wallet: r.wallet, note: r.note || "" }))
            });
        }
        const partial = recipients.filter(r => r.name.toLowerCase().includes(query));
        if (partial.length === 0) return Response.json({ error: "Recipient not found" }, { status: 404 });
        if (partial.length === 1) {
            const r = partial[0];
            return Response.json({ match_type: "partial_unique", wallet: r.wallet, recipient: r.name, note: r.note || "" });
        }
        return Response.json({
            match_type: "ambiguous",
            message: `Multiple recipients match '${name}'. Please specify.`,
            options: partial.map(r => ({ name: r.name, wallet: r.wallet, note: r.note || "" }))
        });
    }

    /* -------------------------------
       Transactions (store & list)
    -------------------------------- */
    async storeTransaction(tx) {
        // Accept flexible payloads used by cron/backend — normalize some fields
        const normalized = {
            address: tx.address || tx.recipient || tx.to || null,
            amount: tx.amount,
            intent: tx.intent || tx.type || "recurring",
            start_date: tx.start_date || new Date().toISOString().split("T")[0],
            time_of_day: tx.time_of_day || null,
            currency: tx.currency || "USDC",
            name: tx.name || null,
            note: tx.note || null,
            status: tx.status || "completed",
            txHash: tx.txHash || null
        };
        if (!normalized.address || !normalized.amount || !normalized.intent || !normalized.start_date) {
            return Response.json({ error: "Missing required fields: wallet, amount, intent, or start date" }, { status: 400 });
        }

        const data = await this._getData();
        data.transactions = data.transactions || [];
        const entry = {
            id: uuidv4(),
            name: normalized.name,
            type: normalized.intent,
            address: normalized.address,
            amount: normalized.amount,
            currency: normalized.currency,
            start_date: normalized.start_date,
            time_of_day: normalized.time_of_day,
            interval: tx.interval || null,
            times: tx.times || null,
            note: normalized.note || "NA",
            status: normalized.status,
            txHash: normalized.txHash || null,
            timestamp: new Date().toISOString()
        };
        data.transactions.push(entry);
        await this._putData(data);
        return Response.json({ success: true, transaction: entry });
    }

    async getTransactions() {
        const data = await this._getData();
        return Response.json({ success: true, transactions: data.transactions || [] });
    }

    /* -------------------------------
       Schedules management inside DO
    -------------------------------- */
    async _getAllSchedules() {
        const data = await this._getData();
        return data.schedules || [];
    }

    async addSchedule(schedule) {
        const data = await this._getData();
        data.schedules = data.schedules || [];
        data.schedules.push(schedule);
        await this._putData(data);

        // store meta.userAddress if not present
        const meta = (await this.state.storage.get("meta")) || {};
        if (!meta.userAddress) {
            // meta.userAddress should already be set by create-schedule caller if available
            await this.state.storage.put("meta", meta);
        }

        return schedule;
    }

    async updateSchedule(scheduleId, patch) {
        const data = await this._getData();
        const idx = (data.schedules || []).findIndex(s => s.id === scheduleId);
        if (idx === -1) throw new Error("schedule not found");
        data.schedules[idx] = { ...data.schedules[idx], ...patch };
        await this._putData(data);
        return data.schedules[idx];
    }

    async deleteSchedule(scheduleId) {
        const data = await this._getData();
        data.schedules = (data.schedules || []).filter(s => s.id !== scheduleId);
        await this._putData(data);
        return { success: true };
    }

    async _appendTransactionRecord(record) {
        const data = await this._getData();
        data.transactions = data.transactions || [];
        data.transactions.push(record);
        await this._putData(data);
    }

    // DO no longer implements alarm()
}

/* ---------------------------------------------------------
   Main worker router (top-level) + scheduled handler (cron)
   - /parse-intent forwarded to parseIntent function
   - /create-schedule top-level: forwards to user's DO, then writes an index entry to KV "SCHEDULE_KV"
   - scheduled(event) : scan "SCHEDULE_KV" and execute due schedules
--------------------------------------------------------- */

async function parseIntent(request, env) {
    const { text, address } = await request.json();
    const today = new Date().toISOString().split("T")[0];

    const systemPrompt = `
You are an intelligent payment intent parser for VoicePay.

Today's date is ${today}.

Your goal is to extract a structured, machine-readable payment intent from a natural language command.

Respond **only** in valid JSON — no comments, no explanations, no extra text.

---

Example Scenarios:
- "Send $50 to Alex once for dinner"
- "Pay rent to Sarah every month on the 1st"
- "Transfer 20 USDC to John every Friday morning for groceries"
- "Send 100 USDC to wallet 0x123abc for gas fees"

---

Rules:
1. Determine if it's a **one-time** or **recurring** payment.
2. If recurring, identify the **interval** (daily, weekly, monthly, yearly) and any **start_date** or **specific day/time**.
3. If no start date is mentioned, assume payments start **today**.
4. Extract any time in 24-hour format (e.g. "09:00").
5. If recipient is a wallet address (starts with 0x), put it in "address" and set "name" to null.
6. If recipient is a name, put it in "name" and set "address" to null.
7. The amount must be numeric (in USD or USDC).
8. Include a "note" for what the payment is for, or null if not provided.
9. Respond strictly in this format:

{
  "intent": "send_once" | "recurring_payment",
  "name": "string" | null,
  "address": "string" | null,
  "amount": number,
  "currency": "USDC",
  "interval": "daily" | "weekly" | "monthly" | "yearly" | null,
  "start_date": "YYYY-MM-DD" | null,
  "time_of_day": "HH:mm" | null,
  "times": number | null,
  "note": "string" | null
}
`;
    const aiResponse = await env.AI.run("@cf/mistral/mistral-7b-instruct-v0.1", {
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
        ]
    });

    let parsed;
    try {
        parsed = JSON.parse(aiResponse.response);
    } catch {
        return Response.json({ status: "error", message: "Server error", raw: aiResponse.response }, { status: 500 });
    }

    if (!parsed.intent || !parsed.amount || (!parsed.name && !parsed.address)) {
        return Response.json({ status: "error", message: "Missing required fields such as amount or recipient or wallet address!", parsed }, { status: 400 });
    }

    // If recipient name, resolve via DO
    if (!parsed.address && parsed.name) {
        const id = env.WALLET_DO.idFromName(address.toLowerCase());
        const stub = env.WALLET_DO.get(id);

        const resp = await stub.fetch(`https://do/recipientByName?address=${address}&name=${encodeURIComponent(parsed.name)}`);
        const data = await resp.json();

        if (resp.status === 404) {
            return Response.json({ status: "recipient_missing", message: `Recipient '${parsed.name}' not found` }, { status: 404 });
        }
        if (data.match_type === "ambiguous") {
            return Response.json({ status: "ambiguous_recipient", message: "Ambiguous recipient" }, { status: 409 });
        }

        parsed.address = data.wallet;
        parsed.name = data.recipient;
    }

    return Response.json({
        status: "success",
        parsedIntent: {
            intent: parsed.intent,
            name: parsed.name || null,
            address: parsed.address || null,
            amount: parsed.amount,
            currency: parsed.currency || "USDC",
            interval: parsed.interval || null,
            start_date: parsed.start_date || today,
            time_of_day: parsed.time_of_day || null,
            times: parsed.times || null,
            note: parsed.note || null
        }
    });
}

/* ---------------------------------------------------------
   Helpers for KV index handling and cron execution
--------------------------------------------------------- */

// write KV schedule index entry (called after DO.create-schedule)
async function writeScheduleIndex(env, userAddress, schedule) {
    // schedule: full schedule object returned by DO
    const key = schedule.id;
    const entry = {
        scheduleId: schedule.id,
        userAddress,
        nextRun: schedule.nextRun,
        recipient: schedule.recipient,
        amount: schedule.amount,
        currency: schedule.currency || "USDC",
        interval: schedule.interval || null,
        intervalMs: schedule.intervalMs || null,
        times: schedule.times ?? null,
        times_remaining: schedule.times_remaining ?? null,
        name: schedule.name || null,
        note: schedule.note || null,
        created_at: schedule.created_at || new Date().toISOString()
    };
    await env.SCHEDULE_KV.put(key, JSON.stringify(entry));
}

// remove KV entry
async function deleteScheduleIndex(env, scheduleId) {
    await env.SCHEDULE_KV.delete(scheduleId);
}

// cron worker: get all schedule keys (paginated) and return objects
async function listAllSchedulesFromKV(env) {
    const results = [];
    let cursor;
    do {
        const list = await env.SCHEDULE_KV.list({ cursor, limit: 100 });
        for (const keyMeta of list.keys) {
            try {
                const raw = await env.SCHEDULE_KV.get(keyMeta.name);
                if (!raw) continue;
                results.push(JSON.parse(raw));
            } catch (err) {
                console.error("Failed to parse KV entry", keyMeta.name, err);
            }
        }
        cursor = list.cursor;
    } while (cursor);
    return results;
}

/* ---------------------------------------------------------
   The scheduled handler — runs on the cron trigger (e.g. every minute)
   It:
     - scans "SCHEDULE_KV"
     - executes due schedules (calls backend /transactions/process-recurring)
     - on success/fail stores transaction record in user's DO
     - updates nextRun/times_remaining in KV and updates DO via /update-schedule
--------------------------------------------------------- */
async function processDueSchedules(env) {
    const now = Date.now();
    const schedules = await listAllSchedulesFromKV(env);
    if (!schedules || schedules.length === 0) return;

    for (const s of schedules) {
        try {
            const nextRunMs = new Date(s.nextRun).getTime();
            if (!Number.isFinite(nextRunMs)) {
                console.warn("Invalid nextRun for schedule:", s.scheduleId);
                continue;
            }
            if (nextRunMs > now) continue; // not due yet

            // compose payload for backend
            const payload = {
                userAddress: s.userAddress,
                recipient: s.recipient,
                name: s.name || null,
                amount: s.amount,
                note: s.note || null,
                schedule_id: s.scheduleId,
                interval: s.interval || null,
                time_of_day: null,
                original_start_date: s.created_at || null
            };

            const bodyStr = JSON.stringify(payload);
            const secret = env.WORKER_SHARED_SECRET;
            const { signature, timestamp } = await signRequest(bodyStr, secret);

            const backendBase = (env.BACKEND_URL || "").replace(/\/$/, "");
            const endpoint = `${backendBase}/transactions/process-recurring`;

            let resp, respJson;
            try {
                resp = await fetch(endpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Worker-Auth": signature,
                        "X-Worker-Timestamp": timestamp
                    },
                    body: bodyStr
                });
                respJson = await resp.json().catch(() => ({ ok: false, error: "invalid-json" }));
            } catch (err) {
                console.error("Error calling backend for scheduled execution:", err);
                resp = { ok: false, status: 0 };
                respJson = { ok: false, error: err.message };
            }

            // Contact the user's DO to store a transaction record
            const doId = env.WALLET_DO.idFromName(s.userAddress.toLowerCase());
            const stub = env.WALLET_DO.get(doId);

            if (resp.ok && respJson && (respJson.ok || respJson.txHash)) {
                // success
                const txRecord = {
                    name: "Recurring Payment",
                    intent: "recurring",
                    amount: s.amount,
                    note: s.note || "",
                    status: "completed",
                    recipient: s.recipient,
                    start_date: new Date().toISOString(),
                    txHash: respJson.txHash || null,
                    address: s.recipient
                };

                // store in DO (best-effort)
                try {
                    await stub.fetch(`https://do/store-transaction?address=${encodeURIComponent(s.userAddress)}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(txRecord)
                    });
                } catch (err) {
                    console.error("Error storing transaction in DO after success:", err);
                }

                // update times_remaining and nextRun
                if (s.times_remaining !== null && s.times_remaining !== undefined) {
                    s.times_remaining = Number(s.times_remaining) - 1;
                }

                s.nextRun = incrementNextRunIso(s.nextRun, s.interval, s.intervalMs);

                // If finished, remove from KV and mark DO
                if (s.times_remaining !== null && s.times_remaining <= 0) {
                    // delete from KV
                    await deleteScheduleIndex(env, s.scheduleId);

                    // also ensure DO schedule marked inactive
                    try {
                        await stub.fetch(`https://do/update-schedule?address=${encodeURIComponent(s.userAddress)}`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ scheduleId: s.scheduleId, patch: { active: false, times_remaining: 0 } })
                        });
                    } catch (err) {
                        console.error("Error updating DO after schedule finished:", err);
                    }
                } else {
                    // write updated entry back to KV
                    await env.SCHEDULE_KV.put(s.scheduleId, JSON.stringify(s));

                    // update DO's schedule record as well
                    try {
                        await stub.fetch(`https://do/update-schedule?address=${encodeURIComponent(s.userAddress)}`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ scheduleId: s.scheduleId, patch: { nextRun: s.nextRun, times_remaining: s.times_remaining } })
                        });
                    } catch (err) {
                        console.error("Error updating DO schedule after success:", err);
                    }
                }
            } else {
                // failure: record & retry logic (schedule a short retry by bumping nextRun forward 10 minutes)
                const txRecord = {
                    name: "Recurring Payment",
                    intent: "recurring",
                    amount: s.amount,
                    note: (respJson && respJson.error) || `backend error: ${resp && resp.status}`,
                    status: "failed",
                    recipient: s.recipient,
                    start_date: new Date().toISOString(),
                    txHash: null,
                    address: s.recipient
                };

                try {
                    await stub.fetch(`https://do/store-transaction?address=${encodeURIComponent(s.userAddress)}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(txRecord)
                    });
                } catch (err) {
                    console.error("Error storing transaction in DO after failure:", err);
                }

                // schedule a retry 10 minutes later (best-effort via KV)
                const retryMs = 10 * 60 * 1000; // 10 minutes
                s.nextRun = new Date(Date.now() + retryMs).toISOString();
                await env.SCHEDULE_KV.put(s.scheduleId, JSON.stringify(s));

                // also update DO
                try {
                    await stub.fetch(`https://do/update-schedule?address=${encodeURIComponent(s.userAddress)}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ scheduleId: s.scheduleId, patch: { nextRun: s.nextRun } })
                    });
                } catch (err) {
                    console.error("Error updating DO schedule after failure:", err);
                }
            }
        } catch (err) {
            console.error("Error processing schedule", s.scheduleId, err);
        }
    } // end for
}

/* ---------------------------------------------------------
   Exported handler object: fetch + scheduled
--------------------------------------------------------- */

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const pathname = url.pathname;
        const method = request.method;

        // parse-intent public
        if (pathname === "/parse-intent" && method === "POST") {
            return parseIntent(request, env);
        }

        // create-schedule top-level: forward to DO create-schedule, then write to KV index
        if (pathname === "/create-schedule" && method === "POST") {
            try {
                const body = await request.json();
                const userAddress = body.userAddress;
                if (!userAddress) return Response.json({ error: "Missing userAddress" }, { status: 400 });

                const id = env.WALLET_DO.idFromName(userAddress.toLowerCase());
                const stub = env.WALLET_DO.get(id);

                // forward to DO create-schedule endpoint
                const resp = await stub.fetch(`https://do/create-schedule?address=${encodeURIComponent(userAddress)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                });

                const data = await resp.json().catch(() => ({ error: "invalid-json" }));

                // if DO created schedule successfully, write index entry
                if (resp.ok && data && data.success && data.schedule) {
                    try {
                        await writeScheduleIndex(env, userAddress, data.schedule);
                    } catch (err) {
                        console.error("Failed to write schedule index to KV:", err);
                        // we still return success to caller since DO created it; KV failure can be repaired manually
                    }
                }

                return new Response(JSON.stringify(data), { status: resp.status, headers: { "Content-Type": "application/json" } });
            } catch (err) {
                console.error("create-schedule (main worker) error:", err);
                return Response.json({ error: "Server error" }, { status: 500 });
            }
        }

        // list-schedules top-level for admins / indexing (optional)
        if (pathname === "/list-schedules" && method === "GET") {
            const auth = request.headers.get("authorization") || "";
            if (!auth.startsWith("Worker ") || auth.split(" ")[1] !== env.WORKER_SHARED_SECRET) {
                return Response.json({ error: "Unauthorized" }, { status: 403 });
            }

            // list from KV
            try {
                const entries = await listAllSchedulesFromKV(env);
                return Response.json({ success: true, count: entries.length, schedules: entries });
            } catch (err) {
                return Response.json({ error: "Failed to list schedules", details: String(err) }, { status: 500 });
            }
        }

        // For other requests that target a DO, require 'address' query param and proxy to DO
        const address = url.searchParams.get("address");
        if (!address) {
            return Response.json({ error: "Missing address" }, { status: 400 });
        }

        const id = env.WALLET_DO.idFromName(address.toLowerCase());
        const stub = env.WALLET_DO.get(id);

        // forward the original request to the DO directly (preserves path)
        return stub.fetch(request);
    },

    // scheduled handler — invoked by Cloudflare cron triggers
    async scheduled(event, env, ctx) {
        try {
            // process due schedules (best-effort)
            await processDueSchedules(env);
        } catch (err) {
            console.error("Error in scheduled handler:", err);
        }
    }
};