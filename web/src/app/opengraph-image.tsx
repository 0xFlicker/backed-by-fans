import { ImageResponse } from "next/og";

import { BackingStackMark } from "@/components/BackingStackMark";

export const alt = "Creator-owned. Backed By Fans.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#f7f2e8",
        color: "#11131a",
        display: "flex",
        height: "100%",
        justifyContent: "space-between",
        padding: "72px 80px",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: "700px" }}>
        <span
          style={{
            fontSize: 24,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          Creator-owned memberships
        </span>
        <span style={{ fontSize: 88, lineHeight: 1, marginTop: 34 }}>
          Your people make your work possible.
        </span>
        <span style={{ fontSize: 34, marginTop: 40 }}>Backed By Fans</span>
      </div>
      <BackingStackMark
        style={{ height: "330px", width: "330px" }}
        title="Backing Stack"
      />
    </div>,
    size,
  );
}
