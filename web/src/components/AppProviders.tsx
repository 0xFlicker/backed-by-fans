"use client";

import { useState, type ReactNode } from "react";
import {
  RainbowKitProvider,
  lightTheme,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type State } from "wagmi";

import { TestnetFaucetNotice } from "@/components/TestnetFaucetNotice";

import { createWalletConfig } from "@/lib/wallet-config";

const rainbowThemeOptions = {
  accentColor: "#ff6a4d",
  accentColorForeground: "#11131a",
  borderRadius: "medium",
  fontStack: "system",
  overlayBlur: "small",
} as const;

const lightWalletTheme = lightTheme({
  ...rainbowThemeOptions,
  // RainbowKit also uses its accent for small link text on the modal surface.
  accentColor: "#b33820",
  accentColorForeground: "#fffdf8",
});
lightWalletTheme.colors.modalBackground = "#fffdf8";
lightWalletTheme.colors.modalTextSecondary = "#4d4f5d";
lightWalletTheme.colors.modalTextDim = "#626472";
const darkWalletTheme = darkTheme(rainbowThemeOptions);
darkWalletTheme.colors.modalBackground = "#202126";
darkWalletTheme.colors.modalTextSecondary = "#bbb8b0";

const rainbowTheme = { lightMode: lightWalletTheme, darkMode: darkWalletTheme };

export function AppProviders({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: State;
}) {
  const [walletConfig] = useState(() => createWalletConfig());
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
        <RainbowKitProvider theme={rainbowTheme}>
          {children}
          <TestnetFaucetNotice />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
