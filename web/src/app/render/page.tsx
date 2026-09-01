"use client";

import { useEffect } from "react";

import { RendererLab } from "@/features/renderer-lab/RendererLab";

export default function RenderPage() {
  useEffect(() => {
    document.body.dataset.rendererLab = "active";
    return () => {
      delete document.body.dataset.rendererLab;
    };
  }, []);

  return <RendererLab />;
}
