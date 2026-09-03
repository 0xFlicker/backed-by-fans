import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  artworkRetryDelayMs,
  ResilientArtworkImage,
} from "@/components/ResilientArtworkImage";

afterEach(() => vi.useRealTimers());

describe("ResilientArtworkImage", () => {
  it("retries the same artwork route once before showing its local fallback", () => {
    vi.useFakeTimers();
    render(
      <ResilientArtworkImage
        alt="Collection artwork"
        fallback={<p>Artwork unavailable</p>}
        height={1200}
        src="/api/chains/46630/tiers/0x123/artwork?v=0xabc"
        unoptimized
        width={1200}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "Collection artwork" }));
    expect(screen.queryByText("Artwork unavailable")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(artworkRetryDelayMs));
    const retried = screen.getByRole("img", { name: "Collection artwork" });
    expect(retried).toHaveAttribute(
      "src",
      "/api/chains/46630/tiers/0x123/artwork?v=0xabc&_artwork_retry=1",
    );

    fireEvent.error(retried);
    expect(screen.getByText("Artwork unavailable")).toBeVisible();
  });
});
