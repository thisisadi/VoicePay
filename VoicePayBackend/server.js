import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import recipientRoutes from "./routes/recipients.js";
import intentRoutes from "./routes/intent.js";
import transactionRoutes from "./routes/transactions.js";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

const allowedOrigin = "http://localhost:3000";

app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// Routes
app.use("/auth", authRoutes);
app.use("/recipients", recipientRoutes);
app.use("/intent", intentRoutes);
app.use("/transactions", transactionRoutes);

const PORT = process.env.PORT;
app.listen(PORT, () =>
  console.log(`✅ VoicePay backend running on port ${PORT}`)
);