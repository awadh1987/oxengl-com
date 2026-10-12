import React, { useState } from 'react';

export const ProvisioningTerminal: React.FC = () => {
  const [slug, setSlug] = useState('');
  const [feedback, setFeedback] = useState('Enter an organization namespace (e.g. "meayon" or "riyadh-crusher") to check namespace.');
  const [feedbackTone, setFeedbackTone] = useState<'neutral' | 'success' | 'error'>('neutral');

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlug(val);
    if (!val) {
      setFeedback('Enter an organization namespace to check namespace availability.');
      setFeedbackTone('neutral');
    } else if (val.length < 3) {
      setFeedback('Namespace must contain at least 3 alphanumeric characters.');
      setFeedbackTone('neutral');
    } else {
      setFeedback(`✓ Workspace https://${val}.oxengl.me is available for immediate provisioning.`);
      setFeedbackTone('success');
    }
  };

  const handleDeploy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || slug.length < 3) {
      setFeedback('Please specify a valid alphanumeric namespace before deploying.');
      setFeedbackTone('error');
      return;
    }
    // Redirect to registration with slug prefilled
    window.location.href = `/register?slug=${encodeURIComponent(slug)}`;
  };

  return (
    <section className="provision-section" id="provision">
      <div className="provision-terminal">
        <div className="terminal-top">
          <div className="window-dot" style={{ backgroundColor: '#f43f5e' }} />
          <div className="window-dot" style={{ backgroundColor: '#f59e0b' }} />
          <div className="window-dot" style={{ backgroundColor: '#10b981' }} />
          <span className="font-mono text-cyan" style={{ fontSize: '11px', marginLeft: '8px' }}>
            OXENGL-PROVISIONING-GATEWAY // KSA-RIYADH-01
          </span>
        </div>

        <div className="provision-content">
          <h2 className="provision-title">Reserve Your Sovereign Tenant Namespace</h2>
          <p className="provision-desc">
            Instantly claim your organization subdomain on <span className="text-orange">.oxengl.me</span>. Your isolated PostgreSQL 16 schema, cryptographic keys, and ZATCA Phase 2 credentials will be dynamically provisioned.
          </p>

          <form onSubmit={handleDeploy} className="provision-form">
            <div className="input-group">
              <span className="input-prefix font-mono">https://</span>
              <input
                type="text"
                id="namespace-slug"
                className="input-slug font-mono"
                placeholder="your-company"
                value={slug}
                onChange={handleSlugChange}
                autoComplete="off"
                spellCheck="false"
              />
              <span className="input-suffix font-mono">.oxengl.me</span>
            </div>

            <button type="submit" className="btn-primary" style={{ padding: '0 24px', height: '48px', whiteSpace: 'nowrap' }}>
              Deploy Workspace
            </button>
          </form>

          <div
            id="provision-feedback"
            className={`provision-feedback font-mono ${
              feedbackTone === 'success' ? 'text-emerald' : feedbackTone === 'error' ? 'text-danger' : 'text-dim'
            }`}
          >
            {feedback}
          </div>
        </div>
      </div>
    </section>
  );
};
