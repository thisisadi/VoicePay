// lib/wagmi.js
import { createConfig, http } from "wagmi";
import { mainnet, polygon, arbitrum, base, sepolia } from "wagmi/chains";
import { metaMask } from "wagmi/connectors";

// ✅ Define ARC Testnet manually
export const arcTestnet = {
    id: 5042002,
    name: "ARC Testnet",
    network: "arc-testnet",
    nativeCurrency: {
        decimals: 18,
        name: "ARC",
        symbol: "ARC",
    },
    rpcUrls: {
        default: { http: ["https://rpc.testnet.arc.network"] },
        public: { http: ["https://rpc.testnet.arc.network"] },
    },
    blockExplorers: {
        default: { name: "ARC Explorer", url: "https://testnet.arcscan.app" },
    },
    testnet: true,
};

// ✅ Add ARC testnet to wagmi config
export const config = createConfig({
    chains: [mainnet, polygon, arbitrum, base, sepolia, arcTestnet],
    connectors: [
        metaMask({
            dappMetadata: {
                name: "VoicePay",
                url: typeof window !== "undefined" ? window.location.origin : "",
            },
        }),
    ],
    transports: {
        [mainnet.id]: http(),
        [polygon.id]: http(),
        [arbitrum.id]: http(),
        [base.id]: http(),
        [sepolia.id]: http(),
        [arcTestnet.id]: http("https://rpc.testnet.arc.network"),
    },
});