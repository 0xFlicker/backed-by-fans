"use client";

import Link from "next/link";
import type { Route } from "next";
import { useChainId } from "wagmi";
import { isSupportedChainId } from "@/lib/chains";
import { publicConfig } from "@/lib/config";

export function ProtocolLink() {
  const selected = useChainId();
  const chainId = isSupportedChainId(selected)
    ? selected
    : publicConfig.defaultChainId;
  return <Link href={`/chains/${chainId}/protocol` as Route}>Protocol</Link>;
}
