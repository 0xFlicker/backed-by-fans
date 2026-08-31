import { useEffect, useRef, useState } from "react";

const wideStudioBreakpointRem = 68;

export function useWideStudioDisclosure() {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [isWide, setIsWide] = useState(false);

  useEffect(() => {
    const details = detailsRef.current;
    const studio = details?.closest<HTMLElement>("[data-creator-studio]");
    if (!details || !studio || typeof ResizeObserver === "undefined") return;

    const rootFontSize = Number.parseFloat(
      window.getComputedStyle(document.documentElement).fontSize,
    );
    const breakpoint = wideStudioBreakpointRem * rootFontSize;
    let wasWide = studio.getBoundingClientRect().width > breakpoint;

    details.open = wasWide;
    setIsWide(wasWide);

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const nextIsWide = entry.contentRect.width > breakpoint;
      if (nextIsWide === wasWide) return;

      wasWide = nextIsWide;
      details.open = nextIsWide;
      setIsWide(nextIsWide);
    });

    observer.observe(studio);
    return () => observer.disconnect();
  }, []);

  return { detailsRef, isWide };
}
