// middleware/authenticate.js
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

/**
 * Unified Authentication Middleware
 * Supports:
 * 1. User JWT (standard flow)
 * 2. Worker Shared Secret (server-initiated tasks)
 */
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: "Missing authorization header" });
    }

    // ------------------------------------------------------
    // 1️⃣ Check for Worker Secret Authentication
    // ------------------------------------------------------
    if (authHeader.startsWith("Worker ")) {
        const providedSecret = authHeader.split(" ")[1];

        if (!providedSecret || providedSecret !== process.env.WORKER_SHARED_SECRET) {
            return res.status(403).json({ error: "Invalid worker secret" });
        }

        // Attach worker identity
        req.user = { type: "worker" };
        return next();
    }

    // ------------------------------------------------------
    // 2️⃣ Normal User JWT Authentication
    // ------------------------------------------------------
    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Invalid token format" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.user = decoded; // attach user info
        next();
    } catch (err) {
        return res.status(403).json({ error: "Invalid or expired token" });
    }
};

export default authenticate;