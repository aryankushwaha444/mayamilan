import SEO from "../components/SEO";

function SecurityPolicy() {
  return (
    <>
      <SEO
        title="Security Policy — Maya Milan"
        description="Our vulnerability disclosure policy and safe harbor commitment."
        path="/security-policy"
      />

      <div className="container py-5" style={{ maxWidth: 800 }}>
        <h1 className="fw-bold mb-4">
          <i className="bi bi-shield-check me-2 text-primary"></i>
          Security Policy
        </h1>

        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body p-4">
            <h4 className="fw-bold mb-3"> Scope</h4>
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
        </div>

        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body p-4">
            <h4 className="fw-bold mb-3">✅ Safe Harbor</h4>
            <p className="text-muted mb-0">
              If you conduct good-faith security research in accordance with
              this policy, we consider your research authorized, will work with
              you to understand and resolve the issue, and will not pursue legal
              action.
            </p>
          </div>
        </div>

        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body p-4">
            <h4 className="fw-bold mb-3">📋 Reporting Guidelines</h4>
            <ul className="text-muted">
              <li>
                Email <strong>rupnarayan444@gmail.com</strong> with a detailed
                description
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
        </div>

        <div className="card border-0 shadow-sm">
          <div className="card-body p-4">
            <h4 className="fw-bold mb-3">⏱️ Our Commitment</h4>
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
        </div>
      </div>
    </>
  );
}

export default SecurityPolicy;
