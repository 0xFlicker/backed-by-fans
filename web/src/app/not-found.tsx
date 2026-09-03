import Link from "next/link";

export default function NotFound() {
  return (
    <section className="page-shell narrow-page">
      <p className="eyebrow">404 · Wrong door</p>
      <h1 className="font-display">
        There’s no membership room at this address.
      </h1>
      <p>Return to the catalog or check the link a creator shared with you.</p>
      <Link className="button button-applause" href="/">
        Explore memberships
      </Link>
    </section>
  );
}
