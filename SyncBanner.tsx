import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './SyncBanner.css';

export function SyncBanner() {
  const { supabaseUser, sendMagicLink, signOutCloud, isGuestMode } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await sendMagicLink(email.trim());
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
    } else {
      setMagicLinkSent(true);
    }
  };

  return (
    <>
      <div className={`sync-banner ${isGuestMode ? 'guest' : 'synced'}`}>
        <div className="banner-content">
          {isGuestMode ? (
            <>
              <span className="banner-icon">⚡</span>
              <span className="banner-text">You are in local guest mode.</span>
              <button className="banner-btn" onClick={() => setShowModal(true)}>
                Sign in with Magic Link to sync across devices
              </button>
            </>
          ) : (
            <>
              <span className="banner-icon">☁️</span>
              <span className="banner-text">
                Cloud Sync Active: <strong>{supabaseUser?.email}</strong>
              </span>
              <button className="banner-btn signout" onClick={signOutCloud}>
                Sign out of Cloud Sync
              </button>
            </>
          )}
        </div>
      </div>

      {showModal && (
        <div className="sync-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="sync-modal-card" onClick={e => e.stopPropagation()}>
            <div className="sync-modal-header">
              <h3>Cloud Sync Sign-In</h3>
              <button className="close-btn" onClick={() => setShowModal(false)}>×</button>
            </div>

            {magicLinkSent ? (
              <div className="magic-success-state">
                <div className="success-icon">📩</div>
                <h4>Check your email!</h4>
                <p>We sent a magic sign-in link to <strong>{email}</strong>.</p>
                <p className="subtext">Click the link in your email to instantly sync your presentation decks across all browsers and devices.</p>
                <button className="banner-btn primary" onClick={() => { setShowModal(false); setMagicLinkSent(false); }}>
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="sync-auth-form">
                <p className="auth-instructions">
                  Enter your email address to receive a 1-click magic link. No passwords needed!
                </p>

                {errorMessage && (
                  <div className="auth-error-alert">⚠️ {errorMessage}</div>
                )}

                <div className="form-group">
                  <label htmlFor="magic-email">EMAIL ADDRESS</label>
                  <input
                    id="magic-email"
                    type="email"
                    className="sync-input"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <button type="submit" className="sync-submit-btn" disabled={isSubmitting}>
                  {isSubmitting ? 'Sending Magic Link...' : 'Send Magic Link 🪄'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
