"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, ExternalLink, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  voiceCommand: string;
  recipient: {
    name: string;
    address: string;
  };
  amount: string;
  token: string;
  transactionType: "Payment" | "Recurring Payment";
  schedule?: string;
  networkFee: string;
  txStatus?: "idle" | "pending" | "success" | "error";
  txHash?: string | null;
  errorMessage?: string | null;
  isPending?: boolean;
}

export default function TransactionModal({
  isOpen,
  onClose,
  onConfirm,
  voiceCommand,
  recipient,
  amount,
  token,
  transactionType,
  schedule,
  networkFee,
  txStatus = "idle",
  txHash = null,
  errorMessage = null,
  isPending = false,
}: TransactionModalProps) {
  if (!isOpen) return null;

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(recipient.address);
    // You could add a toast notification here
  };

  const handleViewOnExplorer = () => {
    if (txHash) {
      window.open(`https://arc-testnet.arcscan.io/tx/${txHash}`, "_blank");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="relative bg-[rgba(20,20,40,0.2)] backdrop-blur-2xl rounded-2xl p-8 w-full max-w-2xl border border-[rgba(0,224,255,0.3)] shadow-[0_0_60px_rgba(0,224,255,0.3),0_0_100px_rgba(168,85,247,0.2)]"
            >
              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>

              {/* Title */}
              <h2 className="text-2xl font-bold text-white mb-6 text-center">
                {txStatus === "pending" || isPending
                  ? "Processing Transaction"
                  : txStatus === "success"
                  ? "Transaction Successful"
                  : txStatus === "error"
                  ? "Transaction Failed"
                  : "Confirm Your Transaction"}
              </h2>

              {/* Status Indicator */}
              {(txStatus === "pending" || isPending || txStatus === "success" || txStatus === "error") && (
                <div className="flex justify-center mb-6">
                  {txStatus === "pending" || isPending ? (
                    <div className="flex items-center gap-3 text-[#00E0FF]">
                      <Loader2 size={24} className="animate-spin" />
                      <span className="text-sm">Waiting for confirmation...</span>
                    </div>
                  ) : txStatus === "success" ? (
                    <div className="flex items-center gap-3 text-green-400">
                      <CheckCircle2 size={24} />
                      <span className="text-sm">Transaction confirmed!</span>
                    </div>
                  ) : txStatus === "error" ? (
                    <div className="flex items-center gap-3 text-red-400">
                      <XCircle size={24} />
                      <span className="text-sm">{errorMessage || "Transaction failed"}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Transaction Hash (if available) */}
              {txHash && (
                <div className="mb-6 p-3 bg-[rgba(16,20,38,0.15)] backdrop-blur-xl border border-[rgba(255,255,255,0.2)] rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Transaction Hash:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-mono">
                        {txHash.slice(0, 10)}...{txHash.slice(-8)}
                      </span>
                      <button
                        onClick={handleViewOnExplorer}
                        className="text-[#00E0FF] hover:text-[#00E0FF]/80 transition-colors"
                      >
                        <ExternalLink size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Voice Command Box */}
              <div className="bg-[rgba(16,20,38,0.15)] backdrop-blur-xl border border-[rgba(255,255,255,0.2)] rounded-xl p-4 mb-6">
                <p className="text-sm text-gray-400 mb-1">You said:</p>
                <p className="text-white text-lg">{voiceCommand}</p>
              </div>

              {/* Central Graphic */}
              <div className="flex justify-center mb-8">
                <div className="relative w-32 h-32">
                  {/* Outer rings */}
                  <div className="absolute inset-0 rounded-full border-2 border-[#00E0FF]/30 animate-pulse" />
                  <div className="absolute inset-4 rounded-full border-2 border-[#A855F7]/30 animate-pulse" style={{ animationDelay: "0.5s" }} />
                  <div className="absolute inset-8 rounded-full border-2 border-[#00E0FF]/20 animate-pulse" style={{ animationDelay: "1s" }} />
                  
                  {/* Arrow */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <svg
                        width="40"
                        height="40"
                        viewBox="0 0 24 24"
                        fill="none"
                        className="text-[#00E0FF]"
                      >
                        <path
                          d="M12 4L12 20M12 20L6 14M12 20L18 14"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </motion.div>
                  </div>
                </div>
              </div>

              {/* Transaction Details */}
              <div className="space-y-4 mb-8">
                {/* Recipient */}
                <div className="flex justify-between items-center py-3 border-b border-[rgba(255,255,255,0.1)]">
                  <span className="text-gray-400">Recipient</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white">{recipient.name}</span>
                    <span className="text-gray-500 text-sm">
                      {recipient.address.slice(0, 6)}...{recipient.address.slice(-4)}
                    </span>
                    <button
                      onClick={handleCopyAddress}
                      className="text-gray-400 hover:text-[#00E0FF] transition-colors"
                    >
                      <Copy size={16} />
                    </button>
                    <button className="text-gray-400 hover:text-[#00E0FF] transition-colors">
                      <ExternalLink size={16} />
                    </button>
                  </div>
                </div>

                {/* Amount */}
                <div className="flex justify-between items-center py-3 border-b border-[rgba(255,255,255,0.1)]">
                  <span className="text-gray-400">Amount</span>
                  <span className="text-[#00E0FF] font-semibold text-lg">
                    {amount} {token}
                  </span>
                </div>

                {/* Transaction Type */}
                <div className="flex justify-between items-center py-3 border-b border-[rgba(255,255,255,0.1)]">
                  <span className="text-gray-400">Transaction Type</span>
                  <span className="text-white">{transactionType}</span>
                </div>

                {/* Schedule (if recurring) */}
                {schedule && (
                  <div className="flex justify-between items-center py-3 border-b border-[rgba(255,255,255,0.1)]">
                    <span className="text-gray-400">Schedule</span>
                    <span className="text-white">{schedule}</span>
                  </div>
                )}

                {/* Network Fee */}
                <div className="flex justify-between items-center py-3">
                  <span className="text-gray-400">Network Fee</span>
                  <span className="text-white">{networkFee}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                {txStatus === "idle" ? (
                  <>
                    <motion.button
                      onClick={onConfirm}
                      disabled={isPending}
                      whileHover={{ scale: isPending ? 1 : 1.02 }}
                      whileTap={{ scale: isPending ? 1 : 0.98 }}
                      className="flex-1 bg-gradient-to-r from-[#00E0FF] to-[#A855F7] text-white font-semibold py-3 px-6 rounded-xl shadow-[0_0_30px_rgba(0,224,255,0.5)] hover:shadow-[0_0_40px_rgba(0,224,255,0.7)] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {/* MetaMask Icon */}
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M22.56 2.24L13.44 8.64L15.04 3.84L22.56 2.24Z"
                          fill="white"
                        />
                        <path
                          d="M1.44 2.24L10.48 8.72L8.96 3.84L1.44 2.24Z"
                          fill="white"
                        />
                        <path
                          d="M19.84 16.96L17.6 20.16L22.24 21.44L23.68 17.12L19.84 16.96Z"
                          fill="white"
                        />
                        <path
                          d="M0.32 17.12L1.76 21.44L6.4 20.16L4.16 16.96L0.32 17.12Z"
                          fill="white"
                        />
                        <path
                          d="M6.88 10.4L5.6 12.16L10.56 12.32L10.4 6.88L6.88 10.4Z"
                          fill="white"
                        />
                        <path
                          d="M17.12 10.4L13.6 6.88L13.44 12.32L18.4 12.16L17.12 10.4Z"
                          fill="white"
                        />
                        <path
                          d="M6.4 20.16L10.24 18.4L6.88 15.36L6.4 20.16Z"
                          fill="white"
                        />
                        <path
                          d="M13.76 18.4L17.6 20.16L17.12 15.36L13.76 18.4Z"
                          fill="white"
                        />
                      </svg>
                      {isPending ? "Processing..." : "Confirm & Sign"}
                    </motion.button>

                    <motion.button
                      onClick={onClose}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex-1 bg-[rgba(26,30,54,0.15)] backdrop-blur-xl border border-[rgba(255,255,255,0.2)] text-white font-semibold py-3 px-6 rounded-xl hover:bg-[rgba(26,30,54,0.25)] transition-all"
                    >
                      Cancel
                    </motion.button>
                  </>
                ) : (
                  <motion.button
                    onClick={onClose}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 bg-gradient-to-r from-[#00E0FF] to-[#A855F7] text-white font-semibold py-3 px-6 rounded-xl shadow-[0_0_30px_rgba(0,224,255,0.5)] hover:shadow-[0_0_40px_rgba(0,224,255,0.7)] transition-all"
                  >
                    Close
                  </motion.button>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

