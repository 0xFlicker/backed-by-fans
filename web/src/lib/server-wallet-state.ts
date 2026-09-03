import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";

import { walletConfig } from "@/lib/wallet-config";

export const readServerWalletState = cache(async () =>
  cookieToInitialState(walletConfig, (await headers()).get("cookie")),
);
