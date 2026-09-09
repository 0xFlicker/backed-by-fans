import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";

import { createWalletConfig } from "@/lib/wallet-config";

export const readServerWalletState = cache(async () =>
  cookieToInitialState(createWalletConfig(), (await headers()).get("cookie")),
);
