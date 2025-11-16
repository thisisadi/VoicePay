import express from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

/**
 * 🔐 Request a nonce for authentication
 */
router.post("/nonce", async (req, res) => {
    try {
        const { address } = req.body;
        if (!address)
            return res.status(400).json({ error: "Missing wallet address" });

        const response = await fetch(`${process.env.CF_WORKER_URL}/nonce?address=${address}`, {
            method: "POST",
        });

        const data = await response.json();
        if (!response.ok) return res.status(response.status).json(data);

        return res.json(data);
    } catch (err) {
        console.error("❌ Error getting nonce:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * ✅ Verify the wallet signature
 */
router.post("/verify", async (req, res) => {
    try {
        const { address, signature } = req.body;
        if (!address || !signature)
            return res.status(400).json({ error: "Missing address or signature" });

        const response = await fetch(`${process.env.CF_WORKER_URL}/verify?address=${address}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signature }),
        });

        const data = await response.json();
        if (!response.ok) return res.status(response.status).json(data);

        // ✅ Signature verified successfully — issue JWT
        const token = jwt.sign(
            { address: address.toLowerCase() },
            process.env.JWT_SECRET,
            { expiresIn: "2h" }
        );

        return res.json({ token, address });
    } catch (err) {
        console.error("❌ Error verifying signature:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default router;