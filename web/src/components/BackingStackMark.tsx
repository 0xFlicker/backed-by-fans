import type { CSSProperties } from "react";

type BackingStackMarkProps = {
  className?: string;
  style?: CSSProperties;
  title?: string;
};

export function BackingStackMark({
  className,
  style,
  title = "Backed By Fans",
}: BackingStackMarkProps) {
  return (
    <svg
      aria-label={title}
      className={className}
      role="img"
      style={style}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#625BFF" height="34" rx="8" width="34" x="6" y="8" />
      <rect fill="#FF6A4D" height="34" rx="8" width="34" x="15" y="15" />
      <rect
        fill="#D9F99D"
        height="34"
        rx="8"
        stroke="#11131A"
        strokeWidth="3"
        width="34"
        x="24"
        y="22"
      />
    </svg>
  );
}
