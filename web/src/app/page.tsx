import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { BackingStackMark } from "@/components/BackingStackMark";
import { CatalogExplorer } from "@/components/CatalogExplorer";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy settle-in">
          <p className="eyebrow">Creator-owned memberships</p>
          <h1 className="font-display">Keep it direct.</h1>
          <p className="hero-lede">
            Set clear terms for the people who support your work, then let them
            join without an intermediary.
          </p>
          <div className="hero-actions">
            <Link className="button button-applause" href="/create">
              Create a membership
            </Link>
            <Link className="button button-outline" href="#how-it-works">
              See how it works
            </Link>
          </div>
        </div>

        <div className="hero-art settle-media">
          <div className="hero-media">
            <Image
              alt="An independent musician preparing to enter a small venue"
              className="hero-image"
              height={1402}
              priority
              sizes="(max-width: 960px) 100vw, 46vw"
              src="/brand/backstage-membership-hero-v1.png"
              width={1122}
            />
          </div>
          <div className="hero-mark" aria-hidden="true">
            <BackingStackMark />
          </div>
        </div>
      </section>

      <section className="principle-section" id="how-it-works">
        <div className="principle-media reveal">
          <Image
            alt="Supporters sharing a printed membership piece at an independent event"
            className="principle-image"
            height={1024}
            sizes="(max-width: 960px) 100vw, 48vw"
            src="/brand/supporting-membership-moment-v1.png"
            width={1536}
          />
        </div>
        <div className="principle-copy reveal">
          <h2 className="font-display">
            Support the work. Keep the membership.
          </h2>
          <p>
            Creators set the terms. Supporters join directly and keep a record
            of their membership.
          </p>
          <dl className="principles">
            <div>
              <dt>Subscribe onchain</dt>
              <dd>Recurring support that lives onchain</dd>
            </div>
            <div>
              <dt>Early has value</dt>
              <dd>Join early to earn more rewards</dd>
            </div>
            <div>
              <dt>Built to compose</dt>
              <dd>
                Onchain building blocks connecting apps, communities, and
                creators
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="catalog-section" aria-labelledby="catalog-title">
        <div className="catalog-heading reveal">
          <h2 className="font-display" id="catalog-title">
            Find a membership worth joining.
          </h2>
          <p>Each listing is read from the registry at a captured block.</p>
          <Link className="text-link" href="/memberships">
            View every membership <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <CatalogExplorer />
      </section>

      <section className="closing-section">
        <BackingStackMark className="closing-mark" />
        <div>
          <h2 className="font-display">
            Build the next chapter with your people.
          </h2>
          <p>
            Start with one membership, clear terms, and a direct line to your
            supporters.
          </p>
        </div>
      </section>
    </>
  );
}
