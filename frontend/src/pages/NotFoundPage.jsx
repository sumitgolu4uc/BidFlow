import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

function NotFoundPage() {
  return (
    <section className="not-found-page">
      <span className="not-found-code">404</span>
      <h1>Page not found</h1>
      <p>The page you requested does not exist.</p>
      <Link to="/" className="button button-primary">
        <ArrowLeft size={17} />
        Return to overview
      </Link>
    </section>
  );
}

export default NotFoundPage;
