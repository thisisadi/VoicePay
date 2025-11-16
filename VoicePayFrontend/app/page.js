"use client";

import React, { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [loading, setLoading] = useState(false);

  // 🔁 Redirect if already connected and JWT exists
  useEffect(() => {
    if (isConnected && typeof window !== "undefined" && localStorage.getItem("jwt")) {
      const timeout = setTimeout(() => router.push("/dashboard"), 100);
      return () => clearTimeout(timeout);
    }
  }, [isConnected, router]);

  const handleConnect = async () => {
    try {
      setLoading(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

      // ✅ Step 1: connect MetaMask
      const metamask = connectors.find(
        (c) => c.id === "metaMask" || c.name === "MetaMask"
      );
      if (!metamask) {
        alert("MetaMask connector not found.");
        return;
      }

      if (!isConnected) {
        await connect({ connector: metamask });
      }

      // ✅ Step 2: get wallet address directly from MetaMask
      let walletAddress;
      if (typeof window !== "undefined" && window.ethereum) {
        const accounts = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        walletAddress = accounts?.[0];
      }

      if (!walletAddress) {
        alert("Could not detect wallet address. Please reconnect MetaMask.");
        disconnect();
        return;
      }

      // ✅ Step 3: fetch nonce from backend
      const nonceResponse = await fetch(`${backendUrl}/auth/nonce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress }),
      });

      if (!nonceResponse.ok) {
        console.error("Nonce fetch error:", nonceResponse.statusText);
        alert("Failed to fetch nonce from backend.");
        disconnect();
        return;
      }

      const { nonce } = await nonceResponse.json();

      // ✅ Step 4: sign message
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [`Welcome to VoicePay!\n\nTo securely sign in, please confirm this message.\n\nSecurity code: ${nonce}\n\nThis signature will not trigger any blockchain transaction or gas fee.`, walletAddress],
      });

      // ✅ Step 5: verify on backend
      const verifyResponse = await fetch(`${backendUrl}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: walletAddress, signature }),
      });

      if (!verifyResponse.ok) {
        alert("Authentication failed. Please try again.");
        disconnect();
        return;
      }

      const { token } = await verifyResponse.json();
      localStorage.setItem("jwt", token);

      // ✅ Step 6: redirect to dashboard
      setTimeout(() => router.push("/dashboard"), 300);

    } catch (error) {
      console.error("❌ Connection error:", error);
      alert("Connection or authentication failed.");
      disconnect();
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex items-center justify-center min-h-screen bg-gradient-to-b from-[#0a0f1c] via-[#101426] to-[#0a0f1c] relative overflow-hidden">
      {/* Background gradient layers with subtle glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(20,22,60,0.8),rgba(10,15,28,0.95)_70%)]" />
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-[#00E0FF] opacity-15 blur-[120px] rounded-full" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-[#A855F7] opacity-10 blur-[100px] rounded-full" />
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,rgba(0,224,255,0.05),transparent_60%)]" />

      {/* Main card with glow effect */}
      <motion.div
        className="relative z-10 bg-[rgba(20,20,40,0.2)] backdrop-blur-2xl rounded-2xl p-16 text-center shadow-[0_0_60px_rgba(0,224,255,0.3),0_0_100px_rgba(168,85,247,0.2)] border border-[rgba(255,255,255,0.2)]"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{
          boxShadow: "0 0 60px rgba(0, 224, 255, 0.3), 0 0 100px rgba(168, 85, 247, 0.2), inset 0 0 40px rgba(0, 224, 255, 0.05)"
        }}
      >
        {/* VoicePay Logo with Wave Icon */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {/* Wave Icon - 4 vertical bars */}
          <div className="flex items-end gap-1.5 h-12">
            <motion.div
              className="w-2 bg-gradient-to-t from-[#00E0FF] to-[#A855F7] rounded-full"
              animate={{ height: ["20px", "48px", "20px"] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
            />
            <motion.div
              className="w-2 bg-gradient-to-t from-[#00E0FF] to-[#A855F7] rounded-full"
              animate={{ height: ["32px", "48px", "32px"] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
            />
            <motion.div
              className="w-2 bg-gradient-to-t from-[#00E0FF] to-[#A855F7] rounded-full"
              animate={{ height: ["24px", "48px", "24px"] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
            />
            <motion.div
              className="w-2 bg-gradient-to-t from-[#00E0FF] to-[#A855F7] rounded-full"
              animate={{ height: ["40px", "48px", "40px"] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: 0.6 }}
            />
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-[#00E0FF] to-[#A855F7] bg-clip-text text-transparent">
            VoicePay
          </h1>
        </div>

        {/* Connect Button with MetaMask Icon */}
        <motion.button
          onClick={handleConnect}
          disabled={isPending || loading}
          className={`relative px-10 py-4 rounded-xl font-semibold text-white text-lg transition-all duration-200 overflow-hidden
            ${isPending || loading
              ? "bg-gray-600 cursor-not-allowed"
              : "bg-gradient-to-r from-[#00E0FF] to-[#A855F7] shadow-[0_0_30px_rgba(0,224,255,0.6),0_0_50px_rgba(168,85,247,0.4)] hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(0,224,255,0.8),0_0_60px_rgba(168,85,247,0.5)]"
            }`}
          whileHover={!isPending && !loading ? { scale: 1.02 } : {}}
          whileTap={!isPending && !loading ? { scale: 0.98 } : {}}
        >
          <span className="relative z-10 flex items-center justify-center gap-3">
            {/* MetaMask Fox Icon */}
            <img
              src="/metamask.webp"
              alt="MetaMask"
              width="24"
              height="24"
              className="object-contain"
            />
            {loading ? "Authenticating..." : isPending ? "Connecting…" : "Connect with MetaMask"}
          </span>
        </motion.button>

        {/* Subtitle */}
        <p className="text-gray-300 mt-8 text-lg font-light">
          Your Voice, Your Transactions, On-Chain.
        </p>
      </motion.div>
    </main>
  );
}