import express from "express";
import dotenv from "dotenv";
import authenticate from "../middleware/authenticate.js";

dotenv.config();
const router = express.Router();

/**
 * 📥 GET /recipients
 * → Fetch all saved recipients for a wallet
 */
router.get("/", authenticate, async (req, res) => {
    try {
        const { address } = req.user;
        const response = await fetch(
            `${process.env.CF_WORKER_URL}/recipients?address=${address}`,
            { method: "GET" }
        );

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (err) {
        console.error("❌ Error fetching recipients:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * ➕ POST /recipients
 * → Add a new recipient
 */
router.post("/", authenticate, async (req, res) => {
    try {
        const { address } = req.user;
        const { name, wallet } = req.body;

        if (!name || !wallet)
            return res.status(400).json({ error: "Missing name or wallet" });

        const response = await fetch(
            `${process.env.CF_WORKER_URL}/recipients?address=${address}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, wallet }),
            }
        );

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (err) {
        console.error("❌ Error adding recipient:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * ✏️ PUT /recipients
 * → Update an existing recipient’s name or wallet
 */
router.put("/", authenticate, async (req, res) => {
    try {
        const { address } = req.user;
        const { oldWallet, newWallet, newName } = req.body;

        if (!oldWallet)
            return res.status(400).json({ error: "Missing old wallet address" });

        const response = await fetch(
            `${process.env.CF_WORKER_URL}/recipients?address=${address}`,
            {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ oldWallet, newWallet, newName }),
            }
        );

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (err) {
        console.error("❌ Error updating recipient:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * 🗑️ DELETE /recipients
 * → Remove a recipient
 */
router.delete("/", authenticate, async (req, res) => {
    try {
        const { address } = req.user;
        const { wallet } = req.body;

        if (!wallet)
            return res.status(400).json({ error: "Missing wallet address" });

        const response = await fetch(
            `${process.env.CF_WORKER_URL}/recipients?address=${address}`,
            {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ wallet }),
            }
        );

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (err) {
        console.error("❌ Error deleting recipient:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default router;