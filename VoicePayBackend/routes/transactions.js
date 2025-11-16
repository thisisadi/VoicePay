import express from "express";
import fetch from "node-fetch";
import axios from "axios";
import { ethers } from "ethers";
import authenticate from "../middleware/authenticate.js";
import workerAuth from "../middleware/workerAuth.js";

const router = express.Router();

/* ---------------------------------------------------------
   STORE TRANSACTION (Protected Route)
--------------------------------------------------------- */
router.post("/store", authenticate, async (req, res) => {
    const userAddress = req.user.address;

    try {
        const {
            address,   // recipient wallet
            name,
            intent,
            amount,
            interval,
            start_date,
            time_of_day,
            times,
            note,
            status
        } = req.body;

        const workerURL = `${process.env.CF_WORKER_URL}/store-transaction?address=${userAddress}`;

        const response = await fetch(workerURL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name,
                intent,
                amount,
                interval,
                start_date,
                time_of_day,
                times,
                note,
                status,
                address // required by durable object worker
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        return res.json({
            success: true,
            stored: data.transaction
        });

    } catch (err) {
        console.error("Error storing transaction:", err);
        return res.status(500).json({ error: "Server error" });
    }
});

/* ---------------------------------------------------------
   GET USER TRANSACTIONS (Protected Route)
--------------------------------------------------------- */
router.get("/", authenticate, async (req, res) => {
    try {
        const address = req.user.address;
        const workerURL = `${process.env.CF_WORKER_URL}/transactions?address=${address}`;

        const response = await fetch(workerURL, {
            headers: { "Content-Type": "application/json" }
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        return res.json({
            success: true,
            transactions: data.transactions || []
        });

    } catch (err) {
        console.error("Error fetching transactions:", err);
        return res.status(500).json({ error: "Server error" });
    }
});

/* ---------------------------------------------------------
   SETUP RECURRING PAYMENT
--------------------------------------------------------- */
router.post("/setup-recurring", authenticate, async (req, res) => {
    try {
        const {
            name,
            address,        // recipient
            amount,
            interval,
            start_date,
            time_of_day,
            times,
            note
        } = req.body;

        const userAddress = req.user.address;

        if (!address || !amount || !interval || !start_date) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Build schedule creation payload
        const schedulePayload = {
            userAddress,
            name,
            recipient: address,
            amount,
            interval,
            start_date,
            time_of_day,
            times,
            note,
            currency: "USDC"
        };

        // Call Worker
        const workerURL = `${process.env.CF_WORKER_URL}/create-schedule`;
        const resp = await axios.post(workerURL, schedulePayload);

        if (!resp.data.success) {
            return res.status(500).json({
                error: "Failed to create schedule"
            });
        }

        // Return recurring contract address for frontend approval step
        return res.json({
            ok: true,
            schedule: resp.data.schedule,
            contractAddress: process.env.RECURRING_CONTRACT,
            message: "Recurring schedule created. Now user must approve contract spending."
        });

    } catch (err) {
        return res.status(500).json({ error: "Server error" });
    }
});

/* ---------------------------------------------------------
   PROCESS RECURRING PAYMENT (Worker → Backend only)
--------------------------------------------------------- */
router.post("/process-recurring", workerAuth, async (req, res) => {
    try {
        const {
            scheduleId,
            userAddress,
            recipient,
            amount,
            token = process.env.USDC_ADDRESS,
            timestamp
        } = req.body;

        if (!scheduleId || !userAddress || !recipient || !amount || !timestamp) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        // ---------------------------------------------
        // 1. Execute Blockchain Payment
        // ---------------------------------------------
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const wallet = new ethers.Wallet(process.env.EXECUTOR_PRIVATE_KEY, provider);

        const contract = new ethers.Contract(
            process.env.RECURRING_CONTRACT,
            [
                "function pullPayment(address token, address from, address to, uint256 amount, bytes32 scheduleId) external returns (bool)"
            ],
            wallet
        );

        let tx;
        try {
            tx = await contract.pullPayment(
                token,
                userAddress,
                recipient,
                amount,
                scheduleId
            );
        } catch (err) {
            console.error("Smart contract error:", err);
            return res.status(500).json({ error: "Contract call failed", details: err.message });
        }

        const receipt = await tx.wait();

        // ---------------------------------------------
        // 2. Log recurring transaction in Worker DO
        // ---------------------------------------------
        const workerURL = `${process.env.CF_WORKER_URL}/store-transaction?address=${userAddress}`;

        const response = await fetch(workerURL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "Recurring Payment",
                intent: "recurring",
                amount,
                note: "",
                status: "success",
                recipient,
                timestamp: Date.now(),
                txHash: receipt.transactionHash,
                scheduleId
            })
        });

        const logData = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error: "Worker refused to store transaction",
                workerResponse: logData
            });
        }

        return res.json({
            ok: true,
            txHash: receipt.transactionHash
        });

    } catch (err) {
        console.error("process-recurring error:", err);
        return res.status(500).json({ error: "Server error" });
    }
});

export default router;