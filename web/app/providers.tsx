"use client";

import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "@/lib/wagmi";

// Wallet UI in the site's colours (Arc Protocol Navy) and typeface.
const walletTheme = lightTheme({
  accentColor: "#1b3158",
  accentColorForeground: "#fbf5f0",
  borderRadius: "medium",
});
walletTheme.fonts.body = "var(--font-geist), ui-sans-serif, system-ui, sans-serif";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={walletTheme}>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
