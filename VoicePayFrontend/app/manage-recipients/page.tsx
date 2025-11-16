"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    Plus,
    Edit2,
    Trash2,
    Lightbulb,
    Search,
    UserPlus,
    User,
    Settings,
    Bell,
    Copy,
    X,
    ArrowLeft,
    LogOut,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAccount, useDisconnect } from "wagmi";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import ParticleBackground from "@/components/ParticleBackground";
import { handleTokenExpiration, isTokenExpired } from "@/lib/auth";

export default function ManageRecipients() {
    const router = useRouter();
    const { isConnected, address } = useAccount();
    const { disconnect } = useDisconnect();

    const [payees, setPayees] = useState<any[]>([]);
    const [search, setSearch] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingPayee, setEditingPayee] = useState<any>(null);
    const [formData, setFormData] = useState({ name: "", address: "" });
    const [authChecked, setAuthChecked] = useState(false);
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);


    // ✅ Flicker-proof protection
    useEffect(() => {
        const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;

        if (!token || !isConnected) {
            router.replace("/");
        } else {
            setAuthChecked(true);
        }
    }, [isConnected, router]);

    // ✅ Fetch recipients function (reusable)
    const fetchRecipients = async (showLoading = true) => {
        const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
        if (!token) return;

        try {
            if (showLoading) setFetching(true);
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
            const response = await fetch(`${backendUrl}/recipients`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            });

            console.log("GET /recipients response status:", response.status);
            
            // Handle token expiration
            if (isTokenExpired(response)) {
                handleTokenExpiration(router, disconnect);
                return;
            }
            
            if (response.ok) {
                const data = await response.json();
                console.log("GET /recipients response data:", data);
                
                // Handle different response formats
                let recipientsArray: any[] = [];
                
                if (Array.isArray(data)) {
                    // Direct array response
                    recipientsArray = data;
                } else if (data && Array.isArray(data.recipients)) {
                    // Wrapped in object with 'recipients' key
                    recipientsArray = data.recipients;
                } else if (data && Array.isArray(data.data)) {
                    // Wrapped in object with 'data' key
                    recipientsArray = data.data;
                } else if (data && typeof data === 'object' && data !== null) {
                    // Single object or object with keys
                    recipientsArray = Object.values(data);
                }
                
                // Transform the data to match our UI structure
                const formattedRecipients = recipientsArray.map((r: any) => {
                    // Handle different field name variations
                    const name = r.name || r.Name || r.recipientName || "";
                    const wallet = r.wallet || r.Wallet || r.address || r.recipientAddress || "";
                    
                    return {
                        name,
                        address: wallet,
                        lastPaid: r.lastPaid || r.lastPaidDate || "Never",
                    };
                }).filter((r: any) => r.name && r.address); // Filter out invalid entries
                
                console.log("Formatted recipients:", formattedRecipients);
                setPayees(formattedRecipients);
                } else {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                console.error("Failed to fetch recipients:", response.status, errorData);
                
                // Handle token expiration (401/403)
                if (isTokenExpired(response)) {
                    handleTokenExpiration(router, disconnect);
                    return;
                }
                
                // If 404 or empty, set empty array
                if (response.status === 404) {
                    setPayees([]);
                }
            }
        } catch (error) {
            console.error("Error fetching recipients:", error);
            setPayees([]);
        } finally {
            if (showLoading) setFetching(false);
        }
    };

    // ✅ Fetch recipients when authenticated
    useEffect(() => {
        if (authChecked && isConnected) {
            fetchRecipients();
        }
    }, [authChecked, isConnected]);

    // 🛑 Prevent render flicker - return blank screen immediately
    if (!authChecked) {
        return (
            <main className="min-h-screen bg-[#0a0f1c]" />
        );
    }

    // ✅ Double check authentication before rendering content
    const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
    if (!token || !isConnected) {
        return (
            <main className="min-h-screen bg-[#0a0f1c]" />
        );
    }

    // 🟦 Add or update payee
    const handleSavePayee = async () => {
        if (!formData.name || !formData.address) {
            alert("Please fill in both fields.");
            return;
        }

        const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
        if (!token) {
            alert("Authentication required. Please reconnect your wallet.");
            return;
        }

        try {
            setLoading(true);
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

            if (isEditing && editingPayee) {
                // Update existing recipient
                const response = await fetch(`${backendUrl}/recipients`, {
                    method: "PUT",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        oldWallet: editingPayee.address,
                        newWallet: formData.address,
                        newName: formData.name,
                    }),
                });

                // Handle token expiration
                if (isTokenExpired(response)) {
                    handleTokenExpiration(router, disconnect);
                    return;
                }

                if (response.ok) {
                    // Refresh the list
                    await fetchRecipients(false);
                    setShowModal(false);
                    setIsEditing(false);
                    setEditingPayee(null);
                    setFormData({ name: "", address: "" });
                } else {
                    const error = await response.json();
                    alert(error.error || "Failed to update recipient");
                }
            } else {
                // Add new recipient
                const response = await fetch(`${backendUrl}/recipients`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        name: formData.name,
                        wallet: formData.address,
                    }),
                });

                // Handle token expiration
                if (isTokenExpired(response)) {
                    handleTokenExpiration(router, disconnect);
                    return;
                }

                if (response.ok) {
                    // Refresh the list
                    await fetchRecipients(false);
                    setShowModal(false);
                    setFormData({ name: "", address: "" });
                } else {
                    const error = await response.json();
                    alert(error.error || "Failed to add recipient");
                }
            }
        } catch (error) {
            console.error("Error saving recipient:", error);
            alert("An error occurred. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // 🟩 Edit an existing payee
    const handleEdit = (payee: any) => {
        setFormData({ name: payee.name, address: payee.address });
        setIsEditing(true);
        setEditingPayee(payee);
        setShowModal(true);
    };

    // 🟥 Delete payee
    const handleDelete = async (payee: any) => {
        if (!confirm(`Are you sure you want to delete "${payee.name}"?`)) {
            return;
        }

        const token = typeof window !== "undefined" ? localStorage.getItem("jwt") : null;
        if (!token) {
            alert("Authentication required. Please reconnect your wallet.");
            return;
        }

        try {
            setLoading(true);
            const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

            const response = await fetch(`${backendUrl}/recipients`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    wallet: payee.address,
                }),
            });

            // Handle token expiration
            if (isTokenExpired(response)) {
                handleTokenExpiration(router, disconnect);
                return;
            }

            if (response.ok) {
                // Refresh the list
                await fetchRecipients(false);
            } else {
                const error = await response.json();
                alert(error.error || "Failed to delete recipient");
            }
        } catch (error) {
            console.error("Error deleting recipient:", error);
            alert("An error occurred. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const filteredPayees = payees.filter(
        (p) =>
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.address.toLowerCase().includes(search.toLowerCase())
    );

    const handleCopyAddress = () => {
        if (address) {
            navigator.clipboard.writeText(address);
        }
    };

    const formatAddress = (addr: string) => {
        if (addr.startsWith("0x")) {
            return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
        }
        return addr;
    };

    const handleDisconnect = () => {
        if (typeof window !== "undefined") {
            localStorage.removeItem("jwt");
        }
        disconnect();
        router.push("/");
    };

    return (
        <main className="min-h-screen bg-gradient-to-b from-[#050A1A] via-[#0B0F19] to-[#050A1A] text-white relative overflow-hidden">
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
                            <span>Wallet: {address.slice(0, 6)}...{address.slice(-4)}</span>
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
                    <h2 className="text-4xl font-bold text-white">Manage Recipients</h2>
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

                {/* Search Bar and Add Button */}
                <div className="flex flex-col md:flex-row gap-4 max-w-4xl mx-auto mb-8">
                    <div className="relative flex-1">
                        <Search
                            size={18}
                            className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
                        />
                        <input
                            type="text"
                            placeholder="Search by name or address..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-[rgba(20,23,43,0.15)] backdrop-blur-xl border border-[rgba(0,224,255,0.3)] rounded-full pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#00E0FF]/50 text-gray-200 placeholder-gray-500"
                        />
                    </div>
                    <motion.button
                        onClick={() => {
                            setFormData({ name: "", address: "" });
                            setIsEditing(false);
                            setEditingPayee(null);
                            setShowModal(true);
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        disabled={loading || fetching}
                        className="flex items-center justify-center gap-2 bg-gradient-to-r from-[#00E0FF] to-[#A855F7] hover:opacity-90 text-white px-6 py-3 rounded-full font-semibold transition-all shadow-[0_0_20px_rgba(0,224,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Plus size={18} />
                        Add New Payee
                    </motion.button>
                </div>

                {/* My Saved Payees Section */}
                <div className="max-w-4xl mx-auto relative z-10">
                    <h3 className="text-xl font-semibold text-white mb-6">My Saved Payees</h3>
                    
                    {fetching ? (
                        <div className="text-center text-gray-400 mt-10">
                            <p>Loading recipients...</p>
                        </div>
                    ) : filteredPayees.length === 0 ? (
                        <p className="text-center text-gray-500 mt-10">
                            No saved payees yet. Add one above!
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {filteredPayees.map((payee, i) => (
                                <motion.div
                                    key={`${payee.address}-${i}`}
                                    whileHover={{ scale: 1.01 }}
                                    className="bg-[rgba(20,23,43,0.15)] backdrop-blur-xl border border-[rgba(0,224,255,0.3)] rounded-xl p-5 flex justify-between items-center shadow-[0_0_20px_rgba(0,224,255,0.1)]"
                                >
                                    <div className="flex-1">
                                        <p className="text-lg font-semibold text-white">
                                            {payee.name}
                                        </p>
                                        <p className="text-sm text-gray-400 mt-1">
                                            {formatAddress(payee.address)}
                                        </p>
                                        {payee.lastPaid && (
                                            <p className="text-xs text-gray-500 mt-1">
                                                Last Paid: {payee.lastPaid === "Never" ? "Never" : payee.lastPaid}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => handleEdit(payee)}
                                            disabled={loading}
                                            className="text-[#00E0FF] hover:text-[#A855F7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(payee)}
                                            disabled={loading}
                                            className="text-red-400 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Voice Assistant Tip */}
                <div className="max-w-4xl mx-auto mt-12 border border-[rgba(0,224,255,0.3)] bg-[rgba(20,23,43,0.15)] backdrop-blur-xl p-4 rounded-xl text-sm flex items-start gap-3 text-gray-300 relative z-10">
                    <Lightbulb size={18} className="text-[#00E0FF] mt-0.5 flex-shrink-0" />
                    <p>
                        <span className="text-[#00E0FF] font-semibold">Voice Assistant Tip:</span> You also say: <em>"Add new payee Sarah and map her wallet address 0x..."</em>
                    </p>
                </div>
            </div>

            {/* Add/Edit Payee Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="bg-[rgba(20,23,43,0.2)] backdrop-blur-2xl border border-[rgba(0,224,255,0.3)] rounded-2xl p-8 w-[90%] max-w-md shadow-[0_0_40px_rgba(0,224,255,0.3)]"
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-[#00E0FF] flex items-center gap-2">
                                <UserPlus size={20} />
                                {isEditing ? "Edit Payee" : "Add New Payee"}
                            </h2>
                            <button
                                onClick={() => {
                                    setShowModal(false);
                                    setIsEditing(false);
                                    setFormData({ name: "", address: "" });
                                }}
                                className="text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex flex-col gap-4">
                            <input
                                type="text"
                                placeholder="Payee Name"
                                value={formData.name}
                                onChange={(e) =>
                                    setFormData({ ...formData, name: e.target.value })
                                }
                                className="bg-[rgba(16,20,38,0.15)] backdrop-blur-xl border border-[rgba(255,255,255,0.2)] rounded-lg px-4 py-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#00E0FF]/50"
                            />
                            <input
                                type="text"
                                placeholder="Wallet Address"
                                value={formData.address}
                                onChange={(e) =>
                                    setFormData({ ...formData, address: e.target.value })
                                }
                                className="bg-[rgba(16,20,38,0.15)] backdrop-blur-xl border border-[rgba(255,255,255,0.2)] rounded-lg px-4 py-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#00E0FF]/50"
                            />
                        </div>

                        <div className="flex justify-end gap-4 mt-6">
                            <button
                                onClick={() => {
                                    setShowModal(false);
                                    setIsEditing(false);
                                    setEditingPayee(null);
                                    setFormData({ name: "", address: "" });
                                }}
                                disabled={loading}
                                className="px-4 py-2 rounded-lg bg-[rgba(26,30,54,0.15)] backdrop-blur-xl border border-[rgba(255,255,255,0.2)] text-gray-300 hover:bg-[rgba(26,30,54,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSavePayee}
                                disabled={loading}
                                className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#00E0FF] to-[#A855F7] text-white font-semibold hover:opacity-90 transition-all shadow-[0_0_20px_rgba(0,224,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? "Saving..." : isEditing ? "Save Changes" : "Add Payee"}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </main>
    );
}