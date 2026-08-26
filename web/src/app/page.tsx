import Link from "next/link";

import { BackingStackMark } from "@/components/BackingStackMark";
import { CatalogExplorer } from "@/components/CatalogExplorer";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy settle-in">
          <p className="eyebrow">Creator-owned memberships</p>
          <h1 className="font-display">Your people make your work possible.</h1>
          <p className="hero-lede">
            Create a membership your fans can join directly, with terms you
            control and a membership record they keep.
          </p>
          <div className="hero-actions">
            <Link className="button button-applause" href="/create">
              Create a membership
            </Link>
            <Link className="button button-outline" href="/memberships">
              Explore memberships
            </Link>
          </div>
        </div>

        <div className="hero-art settle-stack" aria-label="The Backing Stack">
          <div className="stack-card stack-card-fans">
            <span>Backed by</span>
            <strong>the people in the room</strong>
          </div>
          <div className="stack-card stack-card-story">
            <span>Membership no. 014</span>
            <strong>Stay part of the story.</strong>
          </div>
          <div className="stack-card stack-card-creator">
            <div className="creator-frame" aria-hidden="true">
              <BackingStackMark className="creator-frame-mark" />
            </div>
            <span>Creator-owned</span>
            <strong>One clear membership, visibly backed.</strong>
          </div>
        </div>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="section-heading">
          <p className="eyebrow">How it works</p>
          <h2 className="font-display">
            Direct support, with the terms in view.
          </h2>
        </div>
        <ol className="how-list">
          <li>
            <span className="font-mono">01</span>
            <div>
              <h3>Creators set the membership</h3>
              <p>
                Price, timing, rewards, and referrals are visible before anyone
                joins.
              </p>
            </div>
          </li>
          <li>
            <span className="font-mono">02</span>
            <div>
              <h3>Fans join directly</h3>
              <p>
                Wallet readiness appears where it matters: network, ETH for gas,
                USDG, and estimated cost.
              </p>
            </div>
          </li>
          <li>
            <span className="font-mono">03</span>
            <div>
              <h3>The record stays with them</h3>
              <p>
                Active time changes. The historical membership credential stays
                in the supporter’s wallet.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="catalog-section" aria-labelledby="catalog-title">
        <div className="section-heading catalog-heading">
          <div>
            <p className="eyebrow">Memberships in the room</p>
            <h2 className="font-display" id="catalog-title">
              Read directly from the registry.
            </h2>
          </div>
          <Link className="text-link" href="/memberships">
            Open the full catalog <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <CatalogExplorer />
      </section>

      <section className="closing-section">
        <BackingStackMark className="closing-mark" />
        <div>
          <p className="eyebrow">Show up. Stay part of the story.</p>
          <h2 className="font-display">
            Membership starts with a relationship.
          </h2>
        </div>
        <Link className="button button-applause" href="/memberships">
          Find a membership
        </Link>
      </section>
    </>
  );
}
