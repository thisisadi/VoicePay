"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
    User,
    Bell,
    Settings,
    LogOut,
    Mic,
    Copy,
    Lock,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAccount, useDisconnect, useReadContract } from "wagmi";
import { formatUnits, isAddress } from "viem";
import { ethers } from "ethers";
import { handleTokenExpiration, isTokenExpired } from "@/lib/auth";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import ParticleBackground from "@/components/ParticleBackground";

// ✅ ARC testnet configuration (replace with actual values)
const ARC_TESTNET_CHAIN_ID = "5042002";
const ARC_TESTNET_RPC = process.env.NEXT_PUBLIC_ARC_RPC_URL;
const ARC_TESTNET_NAME = "ARC Testnet";
const USDC_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS; // Replace with actual USDC contract address
const USDC_DECIMALS = parseInt(process.env.NEXT_PUBLIC_USDC_DECIMALS || "6"); // Default 6, replace if different

// ✅ ERC20 ABI for wagmi (balance reading)
const ERC20_ABI_WAGMI = [
    {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "owner", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "decimals",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "uint8" }],
    },
    {
        name: "symbol",
        type: "function",
        stateMutability: "view",
        inputs: [],
        outputs: [{ name: "", type: "string" }],
    },
];

// ✅ ERC20 ABI for ethers.js (transfer and approve)
const ERC20_ABI_ETHERS = [
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address owner) view returns (uint256)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
    "function allowance(address owner, address spender) view returns (uint256)",
];

export default function Dashboard() {
    const router = useRouter();
    const { address, isConnected } = useAccount();
    const { disconnect } = useDisconnect();

    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [mounted, setMounted] = useState(false);
    const [parsedIntent, setParsedIntent] = useState(null);
    const [parsingError, setParsingError] = useState(null);
    const [isParsing, setIsParsing] = useState(false);
    const [savedRecipients, setSavedRecipients] = useState([]);
    const [txStatus, setTxStatus] = useState("idle"); // "idle" | "pending" | "success" | "error"
    const [txHash, setTxHash] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const [txMessage, setTxMessage] = useState("");
    const [recentTransactions, setRecentTransactions] = useState([]);
    const mediaRecorderRef = useRef(null);
    const audioChunks = useRef([]);

    // ✅ Mount state to prevent hydration mismatch
    useEffect(() => {
        setMounted(true);
    }, []);

    // ✅ Redirect if not authenticated - check immediately
    useEffect(() => {
        if (mounted) {
            const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
            if (!token || !isConnected) {
                router.replace("/");
            }
        }
    }, [isConnected, router, mounted]);

    // ✅ Read USDC balance from ARC testnet
    const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
        address: USDC_CONTRACT_ADDRESS,
        abi: ERC20_ABI_WAGMI,
        functionName: "balanceOf",
        args: [address],
        chainId: 5042002,
        watch: true,
    });

    const { data: usdcDecimals } = useReadContract({
        address: USDC_CONTRACT_ADDRESS,
        abi: ERC20_ABI_WAGMI,
        functionName: "decimals",
        chainId: 5042002,
    });

    const { data: usdcSymbol } = useReadContract({
        address: USDC_CONTRACT_ADDRESS,
        abi: ERC20_ABI_WAGMI,
        functionName: "symbol",
        chainId: 5042002,
    });

    const formattedUSDC = usdcBalance
        ? parseFloat(formatUnits(usdcBalance, usdcDecimals ?? 6)).toFixed(2)
        : "0.00";


    // ✅ Format date to human-readable relative time (shared function)
    const formatRelativeTime = (dateString) => {
        if (!dateString) return "Unknown";
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return "Just now";
            if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? "min" : "mins"} ago`;
            if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? "hr" : "hrs"} ago`;
            if (diffDays === 1) return "Yesterday";
            if (diffDays < 7) return `${diffDays} days ago`;
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch {
            return dateString;
        }
    };

    // ✅ Fetch recent transactions for Recent Activity card
    const fetchRecentTransactions = async () => {
        const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
        if (!token || !isConnected) {
            return;
        }

        try {
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:9000";
            const response = await fetch(`${backendUrl}/transactions`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            });

            // Handle token expiration
            if (isTokenExpired(response)) {
                handleTokenExpiration(router, disconnect);
                return;
            }

            if (response.ok) {
                const data = await response.json();
                const transactions = data.transactions || [];

                // Transform and sort transactions (newest first)
                const formatted = transactions.map((tx) => {
                    const rawDate = tx.created_at || tx.timestamp || new Date().toISOString();
                    return {
                        name: tx.name || "Unknown",
                        amount: tx.amount || 0,
                        currency: tx.currency || "USDC",
                        // Use type field if available, otherwise derive from intent (title case)
                        type: tx.type || (tx.intent === "recurring_payment" ? "Recurring" : "Sent"),
                        timeAgo: formatRelativeTime(rawDate),
                        rawDate: rawDate,
                    };
                }).sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime())
                  .slice(0, 3); // Get only the 3 latest

                setRecentTransactions(formatted);
            } else {
                setRecentTransactions([]);
            }
        } catch (error) {
            console.error("Error fetching recent transactions:", error);
            setRecentTransactions([]);
        }
    };

    // ✅ Fetch recent transactions on mount and when connected
    useEffect(() => {
        if (mounted && isConnected) {
            fetchRecentTransactions();
        }
    }, [mounted, isConnected]);

    // ✅ Fetch saved recipients for address lookup
    useEffect(() => {
        const fetchRecipients = async () => {
            const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
            if (!token) return;

            try {
                const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
                const response = await fetch(`${backendUrl}/recipients`, {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                });

                // Handle token expiration
                if (isTokenExpired(response)) {
                    handleTokenExpiration(router, disconnect);
                    return;
                }

                if (response.ok) {
                    const data = await response.json();
                    let recipientsArray = [];

                    if (Array.isArray(data)) {
                        recipientsArray = data;
                    } else if (data?.recipients) {
                        recipientsArray = data.recipients;
                    } else if (data?.data) {
                        recipientsArray = data.data;
                    }

                    const formatted = recipientsArray.map((r) => ({
                        name: r.name || r.Name || "",
                        address: r.wallet || r.Wallet || r.address || "",
                    })).filter((r) => r.name && r.address);

                    setSavedRecipients(formatted);
                }
            } catch (error) {
                console.error("Error fetching recipients:", error);
            }
        };

        if (isConnected && mounted) {
            fetchRecipients();
        }
    }, [isConnected, mounted]);

    // ✅ Store transaction in backend
    const storeTransaction = async (txData, txHash = null, status = null, errorMsg = null) => {
        try {
            const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
            if (!token) {
                console.error("No JWT token found, cannot store transaction");
                return;
            }

            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:9000";
            // Determine type based on intent (title case)
            const transactionType = txData.intent === "recurring_payment" ? "Recurring" : "Sent";
            const payload = {
                address: txData.address || address, // recipient address
                name: txData.name || null,
                intent: txData.intent,
                type: transactionType, // Explicit type field for backend
                amount: txData.amount,
                interval: txData.interval || null,
                start_date: txData.start_date || null,
                time_of_day: txData.time_of_day || null,
                times: txData.times || null,
                note: txData.note || null,
                status: status || null, // null for success, "Failed" for failure
                txHash: txHash || null,
                chain: "ARC-testnet",
            };

            console.log("Storing transaction with payload:", payload);
            console.log("Backend URL:", `${backendUrl}/transactions/store`);

            const response = await fetch(`${backendUrl}/transactions/store`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            // Handle token expiration
            if (isTokenExpired(response)) {
                handleTokenExpiration(router, disconnect);
                return;
            }

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Failed to store transaction. Status:", response.status);
                console.error("Response:", errorText);

                // Try to parse as JSON for better error message
                try {
                    const errorJson = JSON.parse(errorText);
                    console.error("Error details:", errorJson);
                } catch {
                    // Not JSON, use text as is
                }
            } else {
                const responseData = await response.json();
                console.log("Transaction stored successfully:", responseData);
            }
        } catch (error) {
            console.error("Error storing transaction:", error);
        }
    };

    // ✅ Ensure MetaMask is on ARC testnet
    const ensureArcTestnet = async (provider) => {
        try {
            const network = await provider.getNetwork();
            const currentChainId = network.chainId.toString();

            // Convert ARC_TESTNET_CHAIN_ID to number for comparison
            const arcChainId = typeof ARC_TESTNET_CHAIN_ID === "string" && ARC_TESTNET_CHAIN_ID.startsWith("0x")
                ? parseInt(ARC_TESTNET_CHAIN_ID, 16)
                : parseInt(ARC_TESTNET_CHAIN_ID);

            if (currentChainId !== arcChainId.toString()) {
                // Convert chainId to hex format for MetaMask
                const chainIdHex = `0x${arcChainId.toString(16)}`;

                try {
                    // Try to switch to ARC testnet
                    await window.ethereum.request({
                        method: "wallet_switchEthereumChain",
                        params: [{ chainId: chainIdHex }],
                    });
                } catch (switchError) {
                    // If chain doesn't exist, add it
                    if (switchError.code === 4902) {
                        await window.ethereum.request({
                            method: "wallet_addEthereumChain",
                            params: [
                                {
                                    chainId: chainIdHex,
                                    chainName: ARC_TESTNET_NAME,
                                    rpcUrls: [ARC_TESTNET_RPC],
                                    nativeCurrency: {
                                        name: "ARC",
                                        symbol: "ARC",
                                        decimals: 18,
                                    },
                                    blockExplorerUrls: ["https://testnet.arcscan.app"],
                                },
                            ],
                        });
                    } else {
                        throw switchError;
                    }
                }
            }
        } catch (error) {
            console.error("Error switching to ARC testnet:", error);
            throw new Error("Failed to switch to ARC testnet. Please switch manually in MetaMask.");
        }
    };

    // ✅ Handle recurring payment setup
    const handleRecurringPayment = async (json) => {
        if (!json || json.intent !== "recurring_payment") {
            return;
        }

        // Validate required fields
        if (!json.address || !json.amount || !json.interval || !json.start_date) {
            setTxStatus("error");
            setErrorMessage("Missing required fields for recurring payment: address, amount, interval, or start_date.");
            return;
        }

        // Validate address
        let recipientAddress = json.address;
        if (!recipientAddress && json.name) {
            const searchName = json.name.toLowerCase();
            const found = savedRecipients.find(
                (r) => r.name.toLowerCase().includes(searchName) || searchName.includes(r.name.toLowerCase())
            );
            if (found) {
                recipientAddress = found.address;
            }
        }

        if (!recipientAddress || !isAddress(recipientAddress)) {
            setTxStatus("error");
            setErrorMessage("Invalid recipient address. Please check the address or add the recipient to your payees list.");
            return;
        }

        // Validate amount
        const amountNum = parseFloat(json.amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            setTxStatus("error");
            setErrorMessage("Invalid amount. Please specify a valid amount.");
            return;
        }

        // Check MetaMask
        if (!window.ethereum) {
            setTxStatus("error");
            setErrorMessage("MetaMask is not installed. Please install MetaMask to continue.");
            return;
        }

        try {
            setTxStatus("pending");
            setTxMessage("Setting up recurring payment...");
            setErrorMessage(null);

            // Step 1: Call /transactions/setup-recurring
            const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
            if (!token) {
                setTxStatus("error");
                setErrorMessage("Authentication required. Please reconnect your wallet.");
                return;
            }

            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:9000";
            const setupResponse = await fetch(`${backendUrl}/transactions/setup-recurring`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: json.name || null,
                    address: recipientAddress,
                    amount: json.amount,
                    interval: json.interval,
                    start_date: json.start_date,
                    time_of_day: json.time_of_day || null,
                    times: json.times || null,
                    note: json.note || null,
                }),
            });

            // Handle token expiration
            if (isTokenExpired(setupResponse)) {
                handleTokenExpiration(router, disconnect);
                return;
            }

            if (!setupResponse.ok) {
                const errorData = await setupResponse.json().catch(() => ({ error: setupResponse.statusText }));
                throw new Error(errorData.error || "Failed to setup recurring payment");
            }

            const setupData = await setupResponse.json();
            const { schedule, contractAddress } = setupData;

            if (!contractAddress) {
                throw new Error("No contract address received from backend");
            }

            setTxMessage("Recurring schedule created. Approving contract spending...");

            // Step 2: Connect to MetaMask and approve contract
            const provider = new ethers.BrowserProvider(window.ethereum);
            let accounts = await window.ethereum.request({ method: "eth_accounts" });
            if (accounts.length === 0) {
                accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
            }
            const signer = await provider.getSigner();

            // Ensure we're on ARC testnet
            await ensureArcTestnet(provider);

            // Get USDC contract
            const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI_ETHERS, signer);

            // Get decimals
            let decimals = USDC_DECIMALS;
            try {
                decimals = await usdcContract.decimals();
            } catch {
                // Use default
            }

            // Convert amount to token units
            const amountInUnits = ethers.parseUnits(json.amount.toString(), decimals);

            // Step 3: Approve the recurring contract to spend USDC
            setTxMessage("Please approve the contract in MetaMask...");
            const approveTx = await usdcContract.approve(contractAddress, amountInUnits);
            setTxHash(approveTx.hash);
            setTxMessage(`Approval sent: ${approveTx.hash.slice(0, 10)}... Waiting for confirmation...`);

            // Wait for approval transaction to be mined
            const approveReceipt = await approveTx.wait();
            setTxStatus("success");
            setTxMessage("Recurring payment approved and scheduled!");
            setTxHash(approveReceipt.transactionHash);

            // Step 4: Store the recurring payment transaction
            await storeTransaction(
                {
                    ...json,
                    address: recipientAddress,
                    intent: "recurring_payment",
                },
                approveReceipt.transactionHash,
                null
            );

            // Refresh recent transactions
            setTimeout(() => {
                fetchRecentTransactions();
            }, 1500);

            // Reset after delay
            setTimeout(() => {
                setTxStatus("idle");
                setTxMessage("");
                setTxHash(null);
                setParsedIntent(null);
                setTranscript("");
            }, 3000);
        } catch (error) {
            console.error("Recurring payment error:", error);
            setTxStatus("error");

            // Handle user rejection
            if (error.code === 4001 || error.code === "ACTION_REJECTED" || error.message?.includes("user rejected") || error.message?.includes("User rejected")) {
                setErrorMessage("Approval rejected by user.");
                await storeTransaction(
                    {
                        ...json,
                        address: recipientAddress,
                        intent: "recurring_payment",
                    },
                    null,
                    "Failed",
                    "User rejected approval"
                );
            } else {
                const errorMsg = error.message || error.reason || "Failed to setup recurring payment";
                setErrorMessage(errorMsg);
                // Get current txHash from state if available
                const currentTxHash = txHash || null;
                await storeTransaction(
                    {
                        ...json,
                        address: recipientAddress,
                        intent: "recurring_payment",
                    },
                    currentTxHash,
                    "Failed",
                    errorMsg
                );
            }
        }
    };

    // ✅ Handle transcription result and auto-trigger transaction
    const handleTranscriptionResult = async (json) => {
        console.log("handleTranscriptionResult called with:", json);

        if (!json || json.intent !== "send_once") {
            console.log("Intent check failed:", json?.intent);
            // Recurring payments are now handled by handleRecurringPayment
            return;
        }

        console.log("Validating transaction data...");

        // Validate address
        let recipientAddress = json.address;
        console.log("Initial recipient address:", recipientAddress);

        if (!recipientAddress && json.name) {
            console.log("Looking up address for name:", json.name);
            const searchName = json.name.toLowerCase();
            const found = savedRecipients.find(
                (r) => r.name.toLowerCase().includes(searchName) || searchName.includes(r.name.toLowerCase())
            );
            if (found) {
                recipientAddress = found.address;
                console.log("Found address from saved recipients:", recipientAddress);
            } else {
                console.log("No matching recipient found in saved recipients");
            }
        }

        if (!recipientAddress || !isAddress(recipientAddress)) {
            console.error("Invalid recipient address:", recipientAddress);
            setTxStatus("error");
            setErrorMessage("Invalid recipient address. Please check the address or add the recipient to your payees list.");
            return;
        }

        // Validate amount
        const amountNum = parseFloat(json.amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            console.error("Invalid amount:", json.amount);
            setTxStatus("error");
            setErrorMessage("Invalid amount. Please specify a valid amount.");
            return;
        }

        // Validate currency
        if (json.currency !== "USDC" || !USDC_CONTRACT_ADDRESS) {
            console.error("Invalid currency or missing contract address:", json.currency, USDC_CONTRACT_ADDRESS);
            setTxStatus("error");
            setErrorMessage("Currently only USDC payments are supported. Please specify USDC in your command.");
            return;
        }

        // Check MetaMask
        if (!window.ethereum) {
            console.error("MetaMask not found");
            setTxStatus("error");
            setErrorMessage("MetaMask is not installed. Please install MetaMask to continue.");
            return;
        }

        console.log("All validations passed. Starting transaction...");

        try {
            // Connect to MetaMask (ethers v6 syntax) - DO THIS BEFORE SETTING PENDING STATUS
            // Request accounts first to avoid pending request error
            if (!window.ethereum) {
                throw new Error("MetaMask is not installed");
            }

            // Check if accounts are already connected to avoid duplicate requests
            let accounts = await window.ethereum.request({ method: "eth_accounts" });
            if (accounts.length === 0) {
                accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
            }

            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();

            // Ensure we're on ARC testnet
            await ensureArcTestnet(provider);

            // Check balance before attempting transfer
            const usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI_ETHERS, signer);
            console.log("USDC contract created");

            // Get decimals (use contract or default)
            let decimals = USDC_DECIMALS;
            try {
                decimals = await usdcContract.decimals();
                console.log("Decimals from contract:", decimals);
            } catch (error) {
                console.log("Could not get decimals from contract, using default:", USDC_DECIMALS);
                // Use default if contract call fails
            }

            // Get token symbol and name for better MetaMask display
            let tokenSymbol = "USDC";
            let tokenName = "USD Coin";
            try {
                tokenSymbol = await usdcContract.symbol();
                tokenName = await usdcContract.name();
                console.log("Token symbol:", tokenSymbol, "Token name:", tokenName);
            } catch (error) {
                console.log("Could not get token metadata, using defaults");
            }

            // Convert amount to token units (ethers v6 syntax)
            const amountInUnits = ethers.parseUnits(json.amount.toString(), decimals);
            console.log("Amount in units:", amountInUnits.toString());
            console.log("Amount formatted:", ethers.formatUnits(amountInUnits, decimals), tokenSymbol);
            console.log("Recipient address:", recipientAddress);
            console.log("USDC contract address:", USDC_CONTRACT_ADDRESS);
            const signerAddress = await signer.getAddress();
            console.log("Signer address:", signerAddress);

            // Check balance before transfer - DO THIS BEFORE SETTING PENDING STATUS
            try {
                const balance = await usdcContract.balanceOf(signerAddress);
                console.log("Current balance:", balance.toString());
                if (balance < amountInUnits) {
                    const balanceFormatted = ethers.formatUnits(balance, decimals);
                    setTxStatus("error");
                    setErrorMessage(`Insufficient balance. You have ${balanceFormatted} USDC, but trying to send ${json.amount} USDC.`);
                    alert(`Insufficient balance. You have ${balanceFormatted} USDC, but trying to send ${json.amount} USDC.`);
                    await storeTransaction(
                        { ...json, address: recipientAddress },
                        null,
                        "Failed",
                        "Insufficient balance"
                    );
                    return;
                }
            } catch (balanceError) {
                console.warn("Could not check balance, proceeding with transfer:", balanceError);
            }

            // Use estimateGas to catch balance errors before MetaMask popup
            try {
                await usdcContract.transfer.estimateGas(recipientAddress, amountInUnits);
            } catch (estimateError) {
                if (estimateError.message?.includes("transfer amount exceeds balance") ||
                    estimateError.reason?.includes("transfer amount exceeds balance")) {
                    setTxStatus("error");
                    setErrorMessage("Insufficient balance. You don't have enough USDC to complete this transaction.");
                    alert("Insufficient balance. You don't have enough USDC to complete this transaction.");
                    await storeTransaction(
                        { ...json, address: recipientAddress },
                        null,
                        "Failed",
                        "Insufficient balance"
                    );
                    return;
                }
                // If it's not a balance error, continue with the transfer
            }

            // NOW set pending status - all validations passed
            setTxStatus("pending");
            setTxMessage("Awaiting signature / transaction pending...");
            setErrorMessage(null);

            // Execute transfer (MetaMask popup will appear)
            console.log("Calling transfer function - MetaMask popup should appear now...");
            console.log("Transfer params:", {
                to: recipientAddress,
                amount: amountInUnits.toString(),
            });

            // Execute transfer with explicit transaction options for better MetaMask display
            const tx = await usdcContract.transfer(recipientAddress, amountInUnits, {
                // These options help MetaMask display the transaction better
            });
            console.log("Transaction sent, hash:", tx.hash);
            console.log("Transaction details:", {
                from: signerAddress,
                to: USDC_CONTRACT_ADDRESS,
                value: "0",
                data: tx.data,
            });
            setTxHash(tx.hash);
            setTxMessage(`Transaction sent: ${tx.hash.slice(0, 10)}... Waiting for confirmation...`);

            // Wait for transaction to be mined
            const receipt = await tx.wait();
            setTxStatus("success");
            setTxMessage("Transaction confirmed!");
            setTxHash(receipt.transactionHash);

            // Refresh balance immediately after successful transaction
            if (refetchBalance) {
                setTimeout(() => {
                    refetchBalance();
                }, 1000); // Wait 1 second for blockchain to update
            }

            // Store successful transaction
            await storeTransaction(
                { ...json, address: recipientAddress },
                receipt.transactionHash,
                null
            );

            // Refresh recent transactions after storing
            setTimeout(() => {
                fetchRecentTransactions();
            }, 1500); // Wait 1.5 seconds for backend to update

            // Refresh activity log (triggered by router or state update)
            setTimeout(() => {
                setTxStatus("idle");
                setTxMessage("");
                setTxHash(null);
                setParsedIntent(null);
                setTranscript("");
            }, 2000);
        } catch (error) {
            console.error("Transaction error:", error);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
            console.error("Error reason:", error.reason);
            console.error("Full error:", error);

            setTxStatus("error");

            // Handle insufficient balance error
            if (error.message?.includes("transfer amount exceeds balance") ||
                error.reason?.includes("transfer amount exceeds balance") ||
                error.message?.includes("exceeds balance")) {
                const errorMsg = "Insufficient balance. You don't have enough USDC to complete this transaction.";
                setErrorMessage(errorMsg);
                alert(errorMsg);
                await storeTransaction(
                    { ...json, address: recipientAddress },
                    txHash || null,
                    "Failed",
                    "Insufficient balance"
                );
                return;
            }

            // Handle user rejection
            if (error.code === 4001 || error.code === "ACTION_REJECTED" || error.message?.includes("user rejected") || error.message?.includes("User rejected")) {
                setErrorMessage("Transaction rejected by user.");
                await storeTransaction(
                    { ...json, address: recipientAddress },
                    null,
                    "Failed",
                    "User rejected transaction"
                );
            } else {
                const errorMsg = error.message || error.reason || "Transaction failed";
                setErrorMessage(errorMsg);
                await storeTransaction(
                    { ...json, address: recipientAddress },
                    txHash || null,
                    "Failed",
                    errorMsg
                );
            }
        }
    };

    const handleDisconnect = () => {
        localStorage.removeItem("jwt");
        disconnect();
        router.push("/");
    };

    const handleMicClick = async () => {
        if (isRecording) {
            mediaRecorderRef.current?.stop();
            setIsRecording(false);
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunks.current = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.current.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks.current, { type: "audio/wav" });
                const formData = new FormData();
                formData.append("file", audioBlob, "voice.wav");
                formData.append("model_id", "scribe_v1");

                try {
                    // Step 1: Transcribe audio
                    const response = await fetch(process.env.NEXT_PUBLIC_ELEVENLABS_API_URL, {
                        method: "POST",
                        headers: { "xi-api-key": process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY },
                        body: formData,
                    });
                    if (!response.ok) throw new Error("Transcription failed");
                    const data = await response.json();
                    const transcribedText = data.text;
                    setTranscript(transcribedText);

                    // Step 2: Parse intent from backend
                    setIsParsing(true);
                    setParsingError(null);
                    setParsedIntent(null);

                    const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
                    if (!token) {
                        setParsingError("Authentication required. Please reconnect your wallet.");
                        setIsParsing(false);
                        return;
                    }

                    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:9000";
                    const parseResponse = await fetch(`${backendUrl}/intent/parse-intent`, {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${token}`,
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ text: transcribedText }),
                    });

                    // Handle token expiration
                    if (isTokenExpired(parseResponse)) {
                        handleTokenExpiration(router, disconnect);
                        setIsParsing(false);
                        return;
                    }

                    const responseData = await parseResponse.json();

                    // Check for errors in response - show backend's error message directly
                    if (!parseResponse.ok) {
                        const errorMessage = responseData.error || responseData.message || parseResponse.statusText;
                        throw new Error(errorMessage);
                    }

                    // Check if response indicates error via status field
                    if (responseData.status && responseData.status !== 'success' && responseData.status !== 'send_once' && responseData.status !== 'recurring_payment') {
                        const errorMessage = responseData.error || responseData.message || responseData.status;
                        throw new Error(errorMessage);
                    }

                    // Check if response indicates success
                    if (responseData.success === false) {
                        const errorMessage = responseData.error || responseData.message;
                        throw new Error(errorMessage);
                    }

                    // Extract parsedIntent from nested response structure
                    const intentData = responseData.parsedIntent || responseData;
                    console.log("Extracted intent data:", intentData);

                    setParsedIntent(intentData);
                    setIsParsing(false);

                    // Auto-trigger transaction for send_once or recurring_payment intent
                    console.log("Parsed intent data:", intentData);
                    if (intentData.intent === "send_once") {
                        console.log("Triggering transaction for send_once intent");
                        handleTranscriptionResult(intentData).catch((error) => {
                            console.error("Error in handleTranscriptionResult:", error);
                            setTxStatus("error");
                            setErrorMessage(error.message || "Failed to process transaction");
                        });
                    } else if (intentData.intent === "recurring_payment") {
                        console.log("Triggering recurring payment setup");
                        handleRecurringPayment(intentData).catch((error) => {
                            console.error("Error in handleRecurringPayment:", error);
                            setTxStatus("error");
                            setErrorMessage(error.message || "Failed to setup recurring payment");
                        });
                    } else {
                        console.log("Intent is not send_once or recurring_payment:", intentData.intent);
                    }
                } catch (err) {
                    console.error("❌ Error:", err);
                    setIsParsing(false);
                    setParsingError(err.message || "Failed to process voice command. Please try again.");
                    setTranscript(`⚠️ ${err.message || "Processing failed. Please try again."}`);
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (error) {
            console.error("🎤 Microphone access denied:", error);
            alert("Please allow microphone access to record voice commands.");
        }
    };

    const voiceHint = isParsing
        ? "Processing your command..."
        : parsingError
            ? parsingError
            : isRecording
                ? "Listening...."
                : transcript
                    ? transcript
                    : "Pay John Doe twenty-five USDC recurring every Friday";

    const hintStyle = txStatus === "pending"
        ? "text-[#00e0ff] animate-pulse"
        : txStatus === "success"
            ? "text-green-400"
            : txStatus === "error"
                ? "text-red-400"
                : isParsing
                    ? "text-[#00e0ff] animate-pulse"
                    : parsingError
                        ? "text-red-400"
                        : isRecording
                            ? "text-[#00e0ff] animate-pulse"
                            : transcript
                                ? "text-white"
                                : "text-gray-400/80 italic";



    const handleCopyAddress = () => {
        if (address) {
            navigator.clipboard.writeText(address);
        }
    };

    // ✅ Prevent rendering if not authenticated or not mounted
    if (!mounted) {
        return (
            <main className="min-h-screen bg-[#0a0f1c]" />
        );
    }

    // ✅ Check authentication before rendering content
    const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
    if (!token || !isConnected) {
        return (
            <main className="min-h-screen bg-[#0a0f1c]" />
        );
    }

    return (
        <main className="min-h-screen bg-gradient-to-b from-[#050A1A] via-[#0B0F19] to-[#050A1A] text-white relative overflow-hidden">
            {/* Particle Background */}
            <div className="absolute inset-0 z-0">
                <ParticleBackground />
            </div>

            {/* Header */}
            <header className="flex justify-between items-center px-8 md:px-10 py-6 relative z-10">
                {/* VoicePay Logo with Wave Icon */}
                <div className="flex items-center gap-3">
                    <div className="flex items-end gap-1 h-8">
                        <motion.div
                            className="w-1.5 bg-gradient-to-t from-[#00E0FF] to-[#A855F7] rounded-full"
                            animate={{ height: ["12px", "32px", "12px"] }}
                            transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
                        />
                        <motion.div
                            className="w-1.5 bg-gradient-to-t from-[#00E0FF] to-[#A855F7] rounded-full"
                            animate={{ height: ["20px", "32px", "20px"] }}
                            transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
                        />
                        <motion.div
                            className="w-1.5 bg-gradient-to-t from-[#00E0FF] to-[#A855F7] rounded-full"
                            animate={{ height: ["16px", "32px", "16px"] }}
                            transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
                        />
                        <motion.div
                            className="w-1.5 bg-gradient-to-t from-[#00E0FF] to-[#A855F7] rounded-full"
                            animate={{ height: ["24px", "32px", "24px"] }}
                            transition={{ duration: 1.2, repeat: Infinity, delay: 0.6 }}
                        />
                    </div>
                    <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#00E0FF] to-[#A855F7] bg-clip-text text-transparent">
                        VoicePay
                    </h1>
                </div>

                {/* Wallet Address and Icons */}
                <div className="flex items-center gap-3 md:gap-4 text-gray-300">
                    {mounted && isConnected && address ? (
                        <div className="flex items-center gap-2 bg-[rgba(20,23,43,0.15)] backdrop-blur-xl px-3 py-1.5 rounded-full border border-[rgba(255,255,255,0.2)] text-sm">
                            <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
                            <button
                                onClick={handleCopyAddress}
                                className="text-gray-400 hover:text-[#00E0FF] transition-colors"
                            >
                                <Copy size={14} />
                            </button>
                            <Lock size={14} className="text-gray-500" />
                        </div>
                    ) : null}

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="p-2 rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-all">
                                <Settings size={20} />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            className="bg-[rgba(11,15,25,0.08)] backdrop-blur-2xl border border-cyan-500/20 rounded-xl shadow-[0_0_20px_rgba(0,224,255,0.15)] w-48 p-2"
                        >
                            <DropdownMenuItem
                                className="text-sm cursor-pointer flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-[rgba(0,224,255,0.06)] hover:backdrop-blur-md hover:shadow-[0_0_15px_rgba(0,224,255,0.2)] transition-all duration-200 focus:bg-[rgba(0,224,255,0.06)] focus:backdrop-blur-md focus:outline-none"
                                onClick={() => router.push("/manage-recipients")}
                            >
                                <User size={16} className="text-[#00E0FF] drop-shadow-[0_0_8px_rgba(0,224,255,0.8)]" />
                                <span className="font-medium bg-gradient-to-r from-[#00E0FF] to-[#A855F7] bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(0,224,255,0.6)]">
                                    Manage Payees
                                </span>
                            </DropdownMenuItem>
                            <div className="h-px bg-gradient-to-r from-cyan-500/30 via-purple-500/30 to-transparent my-1 mx-2 blur-[0.5px]"></div>
                            <DropdownMenuItem
                                className="text-sm cursor-pointer flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-[rgba(248,113,113,0.06)] hover:backdrop-blur-md hover:shadow-[0_0_15px_rgba(248,113,113,0.2)] transition-all duration-200 focus:bg-[rgba(248,113,113,0.06)] focus:backdrop-blur-md focus:outline-none"
                                onClick={handleDisconnect}
                            >
                                <LogOut size={16} className="text-[#F87171] drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]" />
                                <span className="font-medium text-[#F87171] drop-shadow-[0_0_8px_rgba(248,113,113,0.6)]">
                                    Disconnect
                                </span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>

            {/* Main Section - Microphone and Voice Command */}
            <section className="flex flex-col items-center justify-center text-center mt-8 md:mt-12 relative z-10 px-4">
                {/* Animated Microphone with Sound Waves */}
                <motion.div
                    className="relative mb-8 cursor-pointer"
                    onClick={handleMicClick}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.8 }}
                >
                    {/* Sound wave circles - expanding rings when recording */}
                    {isRecording && (
                        <>
                            {[1, 2, 3].map((i) => (
                                <motion.div
                                    key={i}
                                    className="absolute inset-0 rounded-full border-2 border-[#00E0FF]"
                                    style={{ scale: 1 + i * 0.3 }}
                                    animate={{
                                        scale: [1 + i * 0.3, 1.5 + i * 0.3, 1 + i * 0.3],
                                        opacity: [0.6, 0, 0.6],
                                    }}
                                    transition={{
                                        duration: 2,
                                        repeat: Infinity,
                                        delay: i * 0.3,
                                    }}
                                />
                            ))}
                        </>
                    )}

                    {/* Glow effect */}
                    <div className="absolute inset-0 blur-3xl bg-[#00E0FF]/20 rounded-full"></div>

                    {/* Microphone circle */}
                    <motion.div
                        className={`relative flex items-center justify-center bg-[rgba(16,20,38,0.15)] backdrop-blur-xl border border-[rgba(0,224,255,0.3)] rounded-full w-48 h-48 md:w-56 md:h-56 ${isRecording
                            ? "shadow-[0_0_80px_rgba(0,224,255,0.6)]"
                            : "shadow-[0_0_60px_rgba(0,224,255,0.4)]"
                            }`}
                        animate={{
                            boxShadow: isRecording
                                ? [
                                    "0 0 80px rgba(0,224,255,0.6)",
                                    "0 0 100px rgba(168,85,247,0.5)",
                                    "0 0 80px rgba(0,224,255,0.6)",
                                ]
                                : [
                                    "0 0 60px rgba(0,224,255,0.4)",
                                    "0 0 80px rgba(168,85,247,0.3)",
                                    "0 0 60px rgba(0,224,255,0.4)",
                                ],
                        }}
                        transition={{ duration: 2.5, repeat: Infinity }}
                    >
                        <Mic
                            size={80}
                            className={
                                isRecording ? "text-[#00E0FF] animate-pulse" : "text-[#00E0FF]"
                            }
                        />
                    </motion.div>
                </motion.div>

                {/* Voice Command Text Box */}
                <motion.div
                    className={`w-full max-w-2xl px-6 py-4 border border-[rgba(0,224,255,0.3)] rounded-full bg-[rgba(20,23,43,0.15)] backdrop-blur-xl text-lg shadow-[0_0_20px_rgba(0,224,255,0.2)] ${hintStyle}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    {voiceHint}
                </motion.div>

                {/* Transaction Status Message */}
                {(txStatus === "pending" || txStatus === "success" || txStatus === "error" || txMessage) && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`mt-6 px-6 py-3 rounded-xl border ${txStatus === "pending"
                            ? "bg-[rgba(0,224,255,0.1)] border-[#00E0FF] text-[#00E0FF]"
                            : txStatus === "success"
                                ? "bg-[rgba(34,197,94,0.1)] border-green-500 text-green-400"
                                : txStatus === "error"
                                    ? "bg-[rgba(239,68,68,0.1)] border-red-500 text-red-400"
                                    : "bg-[rgba(20,23,43,0.15)] border-[rgba(255,255,255,0.2)] text-gray-300"
                            } backdrop-blur-xl`}
                    >
                        <div className="flex items-center gap-2">
                            {txStatus === "pending" && (
                                <div className="w-2 h-2 bg-[#00E0FF] rounded-full animate-pulse"></div>
                            )}
                            {txStatus === "success" && (
                                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                            )}
                            {txStatus === "error" && (
                                <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                            )}
                            <span className="text-sm font-medium">
                                {txMessage || errorMessage || (txStatus === "success" ? "Transaction confirmed!" : "")}
                            </span>
                        </div>
                        {txHash && (
                            <div className="mt-2 text-xs opacity-75">
                                Hash: {txHash.slice(0, 10)}...{txHash.slice(-8)}
                            </div>
                        )}
                    </motion.div>
                )}
            </section>

            {/* Dashboard Cards */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto mt-12 md:mt-16 px-6 pb-16 relative z-10">
                {/* My Balance Card */}
                <motion.div
                    className="bg-[rgba(20,23,43,0.15)] backdrop-blur-xl p-6 rounded-2xl border border-[rgba(0,224,255,0.3)] shadow-[0_0_30px_rgba(0,224,255,0.15)]"
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.2 }}
                >
                    <h2 className="text-white text-base font-semibold mb-1">My Balance</h2>
                    <p className="text-gray-400 text-sm mb-4">Total Balance</p>
                    <h3 className="text-4xl font-bold text-[#00E0FF] mb-6">
                        ${(parseFloat(formattedUSDC) * 1.0).toFixed(2)}
                    </h3>

                    {/* Token Balances */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-2 rounded-lg">
                            <span className="text-white text-sm">{formattedUSDC} {usdcSymbol ?? "USDC"}</span>
                        </div>
                    </div>
                </motion.div>

                {/* Recent Activity Card */}
                <motion.div
                    className="bg-[rgba(20,23,43,0.15)] backdrop-blur-xl p-6 rounded-2xl border border-[rgba(168,85,247,0.3)] shadow-[0_0_30px_rgba(168,85,247,0.15)] cursor-pointer"
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => router.push("/activity-log")}
                >
                    <h2 className="text-white text-base font-semibold mb-4">Recent Activity</h2>
                    <div className="space-y-3 text-sm">
                        {recentTransactions.length === 0 ? (
                            <div className="text-gray-400 text-center py-4">No recent transactions</div>
                        ) : (
                            recentTransactions.map((tx, index) => (
                                <div key={index} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${tx.type === "Recurring" ? "bg-[#A855F7]" : "bg-[#00E0FF]"}`}></div>
                                        <span className="text-white">
                                            {tx.type === "Recurring" ? `Recurring: ${tx.name}` : `Paid ${tx.name} ${tx.amount} ${tx.currency}`}
                                        </span>
                                    </div>
                                    <span className="text-gray-400">{tx.timeAgo}</span>
                                </div>
                            ))
                        )}
                    </div>
                </motion.div>
            </section>

        </main>
    );
}