import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { SkillPrompt } from "@/features/renderer-skill/SkillPrompt";
import { publicConfig } from "@/lib/config";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Make onchain membership art",
  description:
    "Give an agent an art brief, review the renderer in your browser, and deploy it with your wallet.",
};

const workflow = [
  {
    title: "Describe the work",
    body: "Tell the agent what the membership should feel like. It checks for Git, Bun, and Foundry before building.",
  },
  {
    title: "Review the result",
    body: "Open the renderer package in your browser and judge the artwork across representative membership states.",
  },
  {
    title: "Deploy in your wallet",
    body: "Approve the design, deploy on Robinhood testnet, and keep the reusable renderer contract address.",
  },
];

const resources = [
  {
    href: "/skill/SKILL.md",
    title: "Read the complete agent skill",
    detail: "The full build, preview, and deployment workflow in Markdown.",
  },
  {
    href: "/skill/references/interface.md",
    title: "Read the renderer interface",
    detail: "What the contract receives and what it returns.",
  },
  {
    href: "/skill/references/local-testing.md",
    title: "Test a renderer locally",
    detail: "Foundry tests and a local six-example gallery.",
  },
  {
    download: true,
    href: "/skill/onchain-render-skill.tar.gz",
    title: "Download the complete toolkit",
    detail: "Skill, scripts, Foundry template, references, and tests.",
  },
] as const;

export default function SkillPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={`${styles.heroCopy} settle-in`}>
          <p className="eyebrow">Onchain membership art</p>
          <h1 className="font-display">Describe it. See it onchain.</h1>
          <p className={styles.lede}>
            Give an agent one link, then review the artwork in your browser
            before your wallet gets involved.
          </p>
          <Link className="button button-dark" href="/render">
            Preview a renderer
          </Link>
        </div>
        <div className={`${styles.promptWrap} settle-media`}>
          <SkillPrompt skillUrl={`${publicConfig.siteUrl}/skill`} />
        </div>
      </section>

      <section className={styles.artSection} aria-labelledby="art-title">
        <div className={styles.artCopy}>
          <h2 className="font-display" id="art-title">
            See the art before it goes onchain.
          </h2>
          <p>
            The browser shows what the renderer returns. You decide whether the
            design works.
          </p>
        </div>
        <div className={styles.artWindow}>
          <Image
            alt="A gallery of Backed By Fans onchain membership renderer styles"
            className={styles.artImage}
            height={2136}
            sizes="(max-width: 960px) 100vw, 62vw"
            src="/skill/renderer-gallery.png"
            width={960}
          />
        </div>
      </section>

      <section className={styles.workflow} aria-labelledby="workflow-title">
        <h2 className="font-display" id="workflow-title">
          One brief. One decision. One address.
        </h2>
        <div className={styles.workflowList}>
          {workflow.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.resources} aria-labelledby="resources-title">
        <div>
          <h2 className="font-display" id="resources-title">
            Everything the agent needs.
          </h2>
          <p>
            The public files are readable on the web and downloadable as one
            self-contained toolkit.
          </p>
          <Link className="text-link" href="/llms.txt">
            Open the site&apos;s llms.txt
          </Link>
        </div>
        <div className={styles.resourceLinks}>
          {resources.map((resource) => (
            <a
              download={"download" in resource ? resource.download : undefined}
              href={resource.href}
              key={resource.href}
            >
              <strong>{resource.title}</strong>
              <span>{resource.detail}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
