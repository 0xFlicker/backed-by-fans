import type { Address } from "viem";

export function renderCatalogArtworkFallback(tier: Address) {
  const addressLabel = `${tier.slice(0, 6)}...${tier.slice(-4)}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" role="img" aria-labelledby="title description">
  <title id="title">Membership artwork is catching up</title>
  <desc id="description">A temporary Backed By Fans placeholder for ${addressLabel}</desc>
  <rect width="1200" height="1200" fill="#11131a"/>
  <g opacity="0.16" stroke="#fffdf8" stroke-width="2">
    <path d="M0 240h1200M0 480h1200M0 720h1200M0 960h1200"/>
    <path d="M240 0v1200M480 0v1200M720 0v1200M960 0v1200"/>
  </g>
  <rect x="82" y="82" width="1036" height="1036" rx="64" fill="none" stroke="#fffdf8" stroke-width="4"/>
  <g transform="translate(112 112)">
    <rect width="132" height="132" rx="28" fill="#625bff"/>
    <rect width="132" height="132" x="38" y="38" rx="28" fill="#ff6a4d"/>
    <rect width="132" height="132" x="76" y="76" rx="28" fill="#d9f99d" stroke="#11131a" stroke-width="10"/>
  </g>
  <text x="112" y="405" fill="#d9f99d" font-family="Arial, sans-serif" font-size="34" font-weight="700" letter-spacing="8">BACKED BY FANS</text>
  <text x="112" y="565" fill="#fffdf8" font-family="Georgia, serif" font-size="112">
    <tspan x="112">Artwork is</tspan>
    <tspan x="112" dy="118">catching up.</tspan>
  </text>
  <text x="112" y="890" fill="#c9c3b8" font-family="Arial, sans-serif" font-size="34">The membership is still available.</text>
  <line x1="112" y1="1000" x2="1088" y2="1000" stroke="#fffdf8" stroke-width="3"/>
  <text x="112" y="1068" fill="#fffdf8" font-family="monospace" font-size="28" letter-spacing="3">ONCHAIN MEMBERSHIP</text>
  <text x="1088" y="1068" fill="#fffdf8" font-family="monospace" font-size="28" text-anchor="end">${addressLabel}</text>
</svg>`;
}
