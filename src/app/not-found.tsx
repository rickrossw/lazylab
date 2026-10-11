import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container narrow" style={{ padding: "80px 20px" }}>
      <div className="eyebrow">Xid 404</div>
      <h1>This page has fallen off the bus.</h1>
      <p className="muted">We couldn&apos;t find what you were looking for. Try draining and requeueing:</p>
      <div className="row">
        <Link href="/" className="btn primary">Home</Link>
        <Link href="/atlas/" className="btn">Atlas</Link>
        <Link href="/missions/" className="btn">Missions</Link>
      </div>
    </div>
  );
}
