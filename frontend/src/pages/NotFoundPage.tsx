import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="not-found">
      <p className="eyebrow">404</p>
      <h1>That route is outside the system.</h1>
      <p>Return to the catalog and choose a learning module.</p>
      <Link className="button primary" to="/">
        Back to modules
      </Link>
    </section>
  );
}
