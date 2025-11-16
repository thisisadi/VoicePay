import "./globals.css";
import WalletProvider from "@/components/WalletProvider";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
    title: "VoicePay",
    description: "Your Voice, Your Transactions, On-Chain.",
    icons: {
        icon: '/icon.svg',
    },
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body className={inter.className}>
                <WalletProvider>{children}</WalletProvider>
            </body>
        </html>
    );
}