"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useDisconnect } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { Search, User, Settings, Bell, Copy, ArrowLeft, LogOut } from "lucide-react";
import { handleTokenExpiration, isTokenExpired } from "@/lib/auth";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import ParticleBackground from "@/components/ParticleBackground";

export default function ActivityLog() {
    const router = useRouter();
    const { isConnected, address } = useAccount();
    const { disconnect } = useDisconnect();

    const handleDisconnect = () => {
        if (typeof window !== "undefined") {
            localStorage.removeItem("jwt");
        }
        disconnect();
        router.push("/");
    };

    const [mounted, setMounted] = useState(false);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("All");
    const [activities, setActivities] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Wait for client hydration
    useEffect(() => {
        const timer = setTimeout(() => setMounted(true), 50);
        return () => clearTimeout(timer);
    }, []);

    // Redirect if not connected
    useEffect(() => {
        if (mounted) {
            const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
            if (!token || !isConnected) {
                router.replace("/");
            }
        }
    }, [mounted, isConnected, router]);

    // Fetch transactions from backend
    useEffect(() => {
        const fetchTransactions = async () => {
            const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
            if (!token || !isConnected) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:9000";
                console.log("Fetching transactions from:", `${backendUrl}/transactions`);

                const response = await fetch(`${backendUrl}/transactions`, {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                });

                console.log("GET /transactions response status:", response.status);

                // Handle token expiration
                if (isTokenExpired(response)) {
                    handleTokenExpiration(router, disconnect);
                    return;
                }

                if (response.ok) {
                    const data = await response.json();
                    console.log("GET /transactions response data:", data);
                    const transactions = data.transactions || [];

                    // Format date to human-readable local timezone
                    const formatDate = (dateString: string) => {
                        if (!dateString) return "Unknown";
                        try {
                            const date = new Date(dateString);
                            // Format: "Nov 15, 2025 at 9:33 AM" or similar
                            return date.toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                            });
                        } catch {
                            return dateString;
                        }
                    };

                    // Transform backend transactions to activity format
                    const formattedActivities = transactions.map((tx: any) => {
                        const rawDate = tx.created_at || tx.timestamp || new Date().toISOString();
                        const date = formatDate(rawDate);
                        const name = tx.name || "Unknown";
                        const amount = tx.amount ? `-${tx.amount}` : "-";
                        const currency = tx.currency || "USDC";
                        // Always derive type from intent (normalize to title case)
                        // Handle both intent field and type field that might contain "send_once"/"recurring_payment"
                        const intentValue = tx.intent || tx.type || "";
                        const type = intentValue === "recurring_payment" || intentValue === "RECURRING" || intentValue === "Recurring"
                            ? "Recurring"
                            : "Sent";
                        const status = tx.status === "Failed" ? "Failed" : "Completed";

                        return {
                            date,
                            rawDate, // Keep raw date for sorting
                            name,
                            amount,
                            currency,
                            type,
                            status,
                            note: tx.note || null,
                            icon: "metamask",
                            intent: tx.intent,
                            interval: tx.interval,
                            start_date: tx.start_date,
                            time_of_day: tx.time_of_day,
                            times: tx.times,
                        };
                    });

                    // Sort by date (newest first) - use raw timestamp for sorting
                    formattedActivities.sort((a: any, b: any) => {
                        const dateA = new Date(a.rawDate).getTime();
                        const dateB = new Date(b.rawDate).getTime();
                        return dateB - dateA;
                    });
                    setActivities(formattedActivities);
                } else {
                    // Try to get error message from response
                    let errorMessage = `Failed to fetch transactions: ${response.status}`;
                    try {
                        const errorData = await response.text();
                        console.error("Error response body:", errorData);
                        try {
                            const errorJson = JSON.parse(errorData);
                            errorMessage = errorJson.error || errorJson.message || errorMessage;
                            console.error("Error details:", errorJson);
                        } catch {
                            // Not JSON, use text as is
                            errorMessage = errorData || errorMessage;
                        }
                    } catch (parseError) {
                        console.error("Could not parse error response:", parseError);
                    }
                    console.error(errorMessage);
                    setActivities([]);
                }
            } catch (error) {
                console.error("Error fetching transactions:", error);
                setActivities([]);
            } finally {
                setLoading(false);
            }
        };

        if (mounted && isConnected) {
            fetchTransactions();
        }
    }, [mounted, isConnected]);

    const filtered = activities.filter((a) => {
        const matchesSearch =
            a.name.toLowerCase().includes(search.toLowerCase()) ||
            a.currency.toLowerCase().includes(search.toLowerCase()) ||
            a.date.includes(search);
        // Filter matches directly with type values (title case)
        const matchesFilter = filter === "All" || a.type === filter;
        return matchesSearch && matchesFilter;
    });

    const handleCopyAddress = () => {
        if (address) {
            navigator.clipboard.writeText(address);
        }
    };

    // Icon component
    const TransactionIcon = ({ iconType }: { iconType: string }) => {
        if (iconType === "netflix") {
            return (
                <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center">
                    <span className="text-white font-bold text-xs">N</span>
                </div>
            );
        }
        // MetaMask icon
        return (
            <div className="w-8 h-8 rounded-full bg-[#E2761B] flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 2.24L13.44 8.64L15.04 3.84L22.56 2.24Z" fill="white" />
                    <path d="M1.44 2.24L10.48 8.72L8.96 3.84L1.44 2.24Z" fill="white" />
                    <path d="M19.84 16.96L17.6 20.16L22.24 21.44L23.68 17.12L19.84 16.96Z" fill="white" />
                    <path d="M0.32 17.12L1.76 21.44L6.4 20.16L4.16 16.96L0.32 17.12Z" fill="white" />
                    <path d="M6.88 10.4L5.6 12.16L10.56 12.32L10.4 6.88L6.88 10.4Z" fill="white" />
                    <path d="M17.12 10.4L13.6 6.88L13.44 12.32L18.4 12.16L17.12 10.4Z" fill="white" />
                </svg>
            </div>
        );
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
        <AnimatePresence>
            <motion.main
                key="activity-log"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="min-h-screen bg-gradient-to-b from-[#050A1A] via-[#0B0F19] to-[#050A1A] text-white relative overflow-hidden"
            >
                {/* Particle Background */}
                <div className="absolute inset-0 z-0">
                    <ParticleBackground />
                </div>

                {/* Header */}
                <header className="flex justify-between items-center px-8 md:px-10 py-6 relative z-10 border-b border-[rgba(255,255,255,0.05)]">
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
                        {address ? (
                            <div className="flex items-center gap-2 bg-[rgba(20,23,43,0.15)] backdrop-blur-xl px-3 py-1.5 rounded-full border border-[rgba(255,255,255,0.2)] text-sm">
                                <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
                                <button
                                    onClick={handleCopyAddress}
                                    className="text-gray-400 hover:text-[#00E0FF] transition-colors"
                                >
                                    <Copy size={14} />
                                </button>
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

                {/* Main Content */}
                <div className="px-8 md:px-10 py-8 relative z-10">
                    {/* Title and Back Button */}
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-4xl font-bold text-white">Activity Log</h2>
                        <motion.button
                            onClick={() => router.push("/dashboard")}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="flex items-center gap-2 bg-[rgba(20,23,43,0.15)] backdrop-blur-xl border border-[rgba(255,255,255,0.2)] hover:bg-[rgba(20,23,43,0.25)] text-gray-300 px-4 py-2 rounded-xl transition-all"
                        >
                            <ArrowLeft size={16} />
                            Back to Dashboard
                        </motion.button>
                    </div>

                    {/* Search Bar */}
                    <div className="relative max-w-2xl mb-8">
                        <Search
                            size={18}
                            className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
                        />
                        <input
                            type="text"
                            placeholder="Search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-[rgba(20,23,43,0.15)] backdrop-blur-xl border border-[rgba(255,255,255,0.2)] rounded-full pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#00E0FF]/50 text-gray-200 placeholder-gray-500"
                        />
                    </div>

                    {/* Filters */}
                    <div className="flex justify-start gap-3 mb-8">
                        {["Sent", "All", "Recurring"].map((type) => (
                            <motion.button
                                key={type}
                                onClick={() => setFilter(type)}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className={`px-6 py-2 rounded-full font-medium transition-all ${filter === type
                                    ? "bg-gradient-to-r from-[#00E0FF] to-[#A855F7] text-white shadow-[0_0_20px_rgba(0,224,255,0.4)]"
                                    : "bg-[rgba(20,23,43,0.15)] backdrop-blur-xl border border-[rgba(255,255,255,0.2)] text-gray-400 hover:text-white"
                                    }`}
                            >
                                {type}
                            </motion.button>
                        ))}
                    </div>

                    {/* Activity Table */}
                    <div className="bg-[rgba(20,23,43,0.15)] backdrop-blur-xl border border-[rgba(0,224,255,0.3)] rounded-2xl shadow-[0_0_30px_rgba(0,224,255,0.15)] overflow-hidden">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="text-gray-400">Loading transactions...</div>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="text-gray-400">No transactions found</div>
                            </div>
                        ) : (
                            <>
                                {/* Table Header */}
                                <div className="grid grid-cols-5 text-sm font-semibold text-gray-400 px-6 py-4 border-b border-[rgba(255,255,255,0.1)]">
                                    <span>Date</span>
                                    <span className="text-center">Amount</span>
                                    <span className="text-center">Type</span>
                                    <span className="text-center">Note</span>
                                    <span className="text-right">Status</span>
                                </div>

                                {/* Table Rows */}
                                <div className="divide-y divide-[rgba(255,255,255,0.05)]">
                                    {filtered.map((a: any, i: number) => (
                                        <motion.div
                                            key={i}
                                            whileHover={{ backgroundColor: "rgba(0,224,255,0.05)" }}
                                            transition={{ duration: 0.2 }}
                                            className="grid grid-cols-5 items-center px-6 py-4 text-gray-300 cursor-pointer"
                                        >
                                            <div className="flex items-center gap-3">
                                                <TransactionIcon iconType={a.icon || "metamask"} />
                                                <div>
                                                    <div className="text-sm text-white">{a.name}</div>
                                                    <div className="text-xs text-gray-500">{a.date}</div>
                                                </div>
                                            </div>
                                            <span className="text-center font-semibold text-[#00E0FF]">
                                                {a.amount !== "-" ? `${a.amount} ${a.currency}` : a.currency}
                                            </span>
                                            <span className="text-center text-sm text-white">{a.type}</span>
                                            <span className="text-center text-sm text-white">
                                                {a.note || "-"}
                                            </span>
                                            <span
                                                className={`text-right text-sm ${a.status === "Completed"
                                                    ? "text-green-400"
                                                    : a.status === "Failed"
                                                        ? "text-red-400"
                                                        : "text-yellow-400"
                                                    }`}
                                            >
                                                {a.status}
                                            </span>
                                        </motion.div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </motion.main>
        </AnimatePresence>
    );
}