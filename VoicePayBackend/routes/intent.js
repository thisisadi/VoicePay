import express from "express";
import dotenv from "dotenv";
import authenticate from "../middleware/authenticate.js";

dotenv.config();
const router = express.Router();

router.post("/parse-intent", authenticate, async (req, res) => {
    try {
        const { text } = req.body;

        if (!text || typeof text !== "string") {
            return res.status(400).json({
                success: false,
                error: "Missing or invalid 'text' field"
            });
        }

        const { address } = req.user;

        // --- Call Cloudflare Worker ---
        const workerUrl = `${process.env.CF_WORKER_URL}/parse-intent`;

        const workerResponse = await fetch(workerUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, address })
        });

        const data = await workerResponse.json();
        console.log("Cloudflare worker response:", data);

        return res.status(workerResponse.status).json(data);

    } catch (err) {
        console.error("Error calling Cloudflare worker:", err);
        return res.status(500).json({
            success: false,
            error: err.message || "Internal server error"
        });
    }
});

export default router;