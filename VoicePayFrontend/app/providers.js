"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet, polygon, arbitrum } from "wagmi/chains";
import { metaMask } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const config = createConfig({
    chains: [mainnet, polygon, arbitrum],
    connectors: [metaMask()],
    transports: {
        [mainnet.id]: http(),
        [polygon.id]: http(),
        [arbitrum.id]: http(),
    },
});

const queryClient = new QueryClient();

export function Providers({ children }) {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </WagmiProvider>
    );
}