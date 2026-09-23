import SEO from "../components/SEO";

function SecurityPolicy() {
  return (
    <>
      <SEO
        title="Security Policy — Maya Milan"
        description="Our vulnerability disclosure policy and safe harbor commitment. Report security issues responsibly."
        path="/security-policy"
        type="article"
      />

      <main className="container py-5 security-policy-page" id="main-content">
        <h1 className="fw-bold mb-4">
          <i
            className="bi bi-shield-check me-2 text-primary"
            aria-hidden="true"
          ></i>
          Security Policy
        </h1>

        {/* Scope */}
        <section
          className="card border-0 shadow-sm mb-4"
          aria-labelledby="scope-heading"
        >
          <div className="card-body p-4">
            <h4 id="scope-heading" className="fw-bold mb-3">
              Scope
            </h4>
            <p className="text-muted">
              We welcome security research on the following:
            </p>
            <ul>
              <li>
                <code>mayamilan.vercel.app/</code> and all subdomains
              </li>
              <li>
                Our mobile APIs (<code>api.mayamilan.vercel.app/</code>)
              </li>
            </ul>
            <p className="text-muted mb-0">
              <strong>Out of scope:</strong> Social engineering, physical
              attacks, third-party services, and rate-limit bypass attempts
              against your own account.
            </p>
          </div>
        </section>

        {/* Safe Harbor */}
        <section
          className="card border-0 shadow-sm mb-4"
          aria-labelledby="harbor-heading"
        >
          <div className="card-body p-4">
            <h4 id="harbor-heading" className="fw-bold mb-3">
              <i
                className="bi bi-check-circle-fill me-2 text-success"
                aria-hidden="true"
              ></i>
              Safe Harbor
            </h4>
            <p className="text-muted mb-0">
              If you conduct good-faith security research in accordance with
              this policy, we consider your research authorized, will work with
              you to understand and resolve the issue, and will not pursue legal
              action.
            </p>
          </div>
        </section>

        {/* Reporting Guidelines */}
        <section
          className="card border-0 shadow-sm mb-4"
          aria-labelledby="reporting-heading"
        >
          <div className="card-body p-4">
            <h4 id="reporting-heading" className="fw-bold mb-3">
              <i
                className="bi bi-envelope-paper-fill me-2 text-primary"
                aria-hidden="true"
              ></i>
              Reporting Guidelines
            </h4>
            <ul className="text-muted">
              <li>
                Email{" "}
                <a
                  href="mailto:rupnarayan444@gmail.com"
                  className="fw-semibold"
                >
                  rupnarayan444@gmail.com
                </a>{" "}
                with a detailed description
              </li>
              <li>Include steps to reproduce (PoC scripts welcome)</li>
              <li>
                Do <strong>NOT</strong> access, modify, or delete user data
              </li>
              <li>
                Do <strong>NOT</strong> publicly disclose before we respond
              </li>
              <li>
                Give us <strong>90 days</strong> to fix before public disclosure
              </li>
            </ul>
          </div>
        </section>

        {/* Our Commitment */}
        <section
          className="card border-0 shadow-sm"
          aria-labelledby="commitment-heading"
        >
          <div className="card-body p-4">
            <h4 id="commitment-heading" className="fw-bold mb-3">
              <i
                className="bi bi-clock-history me-2 text-warning"
                aria-hidden="true"
              ></i>
              Our Commitment
            </h4>
            <ul className="text-muted mb-0">
              <li>
                <strong>48 hours:</strong> We acknowledge your report
              </li>
              <li>
                <strong>7 days:</strong> We provide a triage decision
              </li>
              <li>
                <strong>90 days:</strong> We fix and deploy the patch
              </li>
              <li>
                <strong>Credit:</strong> We add you to our Hall of Fame (unless
                you prefer anonymity)
              </li>
            </ul>
          </div>
        </section>
      </main>
    </>
  );
}

export default SecurityPolicy;
