import crypto from "crypto";

function stableStringify(obj) {
    return JSON.stringify(obj, Object.keys(obj).sort());
}

export default function workerAuth(req, res, next) {
    // Only allow signed POST/PUT from Worker
    if (req.method !== "POST" && req.method !== "PUT") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const signature = req.headers["x-worker-auth"];
    const timestamp = req.headers["x-worker-timestamp"];

    if (!signature || !timestamp) {
        return res.status(401).json({ error: "Missing worker signature" });
    }

    // Prevent replay attacks
    const now = Date.now();
    if (Math.abs(now - Number(timestamp)) > 5 * 60 * 1000) {
        return res.status(401).json({ error: "Timestamp too old" });
    }

    const body = req.rawBody || stableStringify(req.body || {});
    const secret = process.env.WORKER_SHARED_SECRET;

    const expected = crypto
        .createHmac("sha256", secret)
        .update(timestamp + body)
        .digest("hex");

    if (signature !== expected) {
        return res.status(403).json({ error: "Invalid worker signature" });
    }

    next();
}