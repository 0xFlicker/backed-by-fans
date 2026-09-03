"use client";

import Image, { type ImageProps } from "next/image";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export const artworkRetryDelayMs = 750;

function retrySource(src: string) {
  return `${src}${src.includes("?") ? "&" : "?"}_artwork_retry=1`;
}

type ResilientArtworkImageProps = Omit<ImageProps, "onError" | "src"> & {
  fallback: ReactNode;
  src: string;
};

function RetryingArtworkImage({
  alt,
  fallback,
  src,
  ...imageProps
}: ResilientArtworkImageProps) {
  const [attempt, setAttempt] = useState<0 | 1>(0);
  const [failed, setFailed] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(
    () => () => {
      if (retryTimer.current !== undefined) {
        clearTimeout(retryTimer.current);
      }
    },
    [],
  );

  if (failed) return fallback;

  return (
    <Image
      {...imageProps}
      alt={alt}
      onError={() => {
        if (attempt === 1) {
          setFailed(true);
          return;
        }
        if (retryTimer.current !== undefined) return;
        retryTimer.current = setTimeout(() => {
          retryTimer.current = undefined;
          setAttempt(1);
        }, artworkRetryDelayMs);
      }}
      src={attempt === 0 ? src : retrySource(src)}
    />
  );
}

export function ResilientArtworkImage(props: ResilientArtworkImageProps) {
  return <RetryingArtworkImage key={props.src} {...props} />;
}
