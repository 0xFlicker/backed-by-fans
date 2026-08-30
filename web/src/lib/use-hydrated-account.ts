"use client";

import { useSyncExternalStore } from "react";
import { useAccount } from "wagmi";

const subscribe = () => () => undefined;

export function useHydratedAccount() {
  const account = useAccount();
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  return {
    address: hydrated ? account.address : undefined,
    chainId: hydrated ? account.chainId : undefined,
    isConnected: hydrated && account.isConnected,
  };
}
