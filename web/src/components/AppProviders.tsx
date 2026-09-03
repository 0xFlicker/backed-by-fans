"use client";

import { useState, type ReactNode } from "react";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type State } from "wagmi";

import { walletConfig } from "@/lib/wallet-config";

const rainbowTheme = lightTheme({
  accentColor: "#ff6a4d",
  accentColorForeground: "#11131a",
  borderRadius: "medium",
  fontStack: "system",
  overlayBlur: "small",
});

export function AppProviders({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: State;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 12_000,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={walletConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rainbowTheme}>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
