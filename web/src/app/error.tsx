"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="page-shell narrow-page" role="alert">
      <p className="eyebrow">The room hit a snag</p>
      <h1 className="font-display">This view could not be completed.</h1>
      <p>
        Retry the page. If onchain state is still unavailable, no balance or
        membership value will be assumed.
      </p>
      <button className="button button-applause" onClick={reset} type="button">
        Try again
      </button>
    </section>
  );
}
