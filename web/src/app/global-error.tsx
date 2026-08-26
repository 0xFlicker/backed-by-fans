"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="global-error-shell" role="alert">
          <p>Backed By Fans</p>
          <h1>Something interrupted the whole room.</h1>
          <button onClick={reset} type="button">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
