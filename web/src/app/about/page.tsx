import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { BackingStackMark } from "@/components/BackingStackMark";

export const metadata: Metadata = {
  title: "About",
  description:
    "How Backed By Fans turns direct creator support into pay-as-you-go membership NFTs on Robinhood Chain.",
  alternates: {
    canonical: "/about",
  },
};

export default function AboutPage() {
  return (
    <>
      <section className="hero about-hero">
        <div className="hero-copy settle-in">
          <p className="eyebrow">Creator-owned memberships</p>
          <h1 className="font-display">Keep it direct.</h1>
          <p className="hero-lede">
            Membership NFTs for creators and the people who keep their work
            moving.
          </p>
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

      <section className="principle-section">
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
          <h2 className="font-display">Support the work.</h2>
          <p>
            Creators set the terms. Supporters pay one period at a time, renew
            when they choose, and join directly.
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

      <section className="about-chain" aria-labelledby="about-chain-title">
        <div className="about-chain-copy reveal">
          <h2 className="font-display" id="about-chain-title">
            The membership is the NFT.
          </h2>
          <p>
            Each membership is an onchain credential connecting a creator and
            supporter. It can carry access, identity, artwork, and membership
            history.
          </p>
        </div>
        <div className="about-chain-network reveal">
          <strong className="font-display">Built on Robinhood Chain.</strong>
          <p>Backed By Fans is currently live on Robinhood Chain Testnet.</p>
        </div>
        <dl className="about-chain-record reveal">
          <div>
            <dt>Membership record</dt>
            <dd>
              Contracts, status, fixed terms, and accounting live onchain.
            </dd>
          </div>
          <div>
            <dt>Membership identity</dt>
            <dd>
              Metadata, artwork rendering, and optional creator media live
              onchain too.
            </dd>
          </div>
        </dl>
      </section>

      <section className="about-periodic" aria-labelledby="periodic-title">
        <div className="about-periodic-heading reveal">
          <h2 className="font-display" id="periodic-title">
            One period at a time.
          </h2>
          <p>
            Membership is pay-as-you-go. There is no automatic billing:
            supporters choose when to join and when to renew.
          </p>
        </div>
        <div className="about-periodic-details reveal">
          <article>
            <h3>Terms stay fixed</h3>
            <p>
              Price, payment token, period, reward, and referral terms do not
              change after a tier is published.
            </p>
          </article>
          <article>
            <h3>Early support counts</h3>
            <p>
              Membership rewards recognize the people who show up and keep
              supporting the work.
            </p>
          </article>
          <article>
            <h3>Referrals can share value</h3>
            <p>
              Creators can reward people who bring new active members into the
              community.
            </p>
          </article>
        </div>
      </section>

      <section className="about-compose" aria-labelledby="compose-title">
        <div className="about-compose-copy reveal">
          <h2 className="font-display" id="compose-title">
            Build on the membership.
          </h2>
          <p>
            Active membership can unlock Discord roles, token-gated apps,
            community spaces, and integrations nobody has built yet.
          </p>
        </div>
        <ul className="about-compose-uses reveal" aria-label="Ways to build">
          <li>Discord roles</li>
          <li>Token-gated experiences</li>
          <li>Community access</li>
          <li>Composable applications</li>
        </ul>
        <p className="about-compose-note reveal">
          Read active membership status onchain to build new experiences and
          integrations. The membership is the NFT.
        </p>
      </section>

      <section className="about-creator" aria-labelledby="creator-title">
        <h2 className="font-display reveal" id="creator-title">
          Creators set the shape.
        </h2>
        <div className="about-creator-columns">
          <article className="reveal">
            <h3>More than one way to join</h3>
            <p>
              A creator can publish multiple tiers, each with its own price,
              period, payment token, rewards, and referral terms.
            </p>
          </article>
          <article className="reveal">
            <h3>Artwork stays in creator hands</h3>
            <p>
              Use the built-in art studio or deploy a custom onchain renderer.
              Update the presentation later without changing the economics.
            </p>
          </article>
        </div>
      </section>

      <section className="about-boundary reveal">
        <h2 className="font-display">A foundation for your community.</h2>
        <p>
          Backed By Fans provides membership, payment, renewal, rewards, and
          credential building blocks. Creators provide the content, access, and
          community around them.
        </p>
      </section>

      <section className="closing-section about-closing">
        <BackingStackMark className="closing-mark" />
        <div>
          <h2 className="font-display">Build it with your people.</h2>
          <p>
            Explore a membership to support, or create one around your own work.
          </p>
          <div className="about-closing-actions">
            <Link className="button button-dark" href="/">
              Explore memberships
            </Link>
            <Link className="button button-applause" href="/create">
              Create a membership
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
