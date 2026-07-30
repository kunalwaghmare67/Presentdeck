import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './SyncBanner.css';

export function SyncBanner() {
  const { workspaceCode, createWorkspace, joinWorkspace, leaveWorkspace, isGuestMode } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [newlyCreatedCode, setNewlyCreatedCode] = useState<string | null>(null);
  const [mode, setMode] = useState<'options' | 'join' | 'created'>('options');

  const handleCreate = async () => {
    if (workspaceCode) {
      const confirmSwitch = window.confirm(
        `You are currently in workspace ${workspaceCode}. Creating a new workspace will switch your device to the new workspace code. Continue?`
      );
      if (!confirmSwitch) return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const code = await createWorkspace();
      setNewlyCreatedCode(code);
      setMode('created');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;

    if (workspaceCode && workspaceCode !== inputCode.trim().toUpperCase()) {
      const confirmSwitch = window.confirm(
        `You are currently in workspace ${workspaceCode}. Joining ${inputCode.trim().toUpperCase()} will switch your device to that workspace code. Continue?`
      );
      if (!confirmSwitch) return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const success = await joinWorkspace(inputCode);
      if (success) {
        setShowModal(false);
        setMode('options');
        setInputCode('');
      } else {
        setErrorMessage('Invalid workspace code. Please check and try again.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to join workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCode = () => {
    const codeToCopy = workspaceCode || newlyCreatedCode;
    if (codeToCopy) {
      navigator.clipboard.writeText(codeToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLeave = () => {
    const confirmLeave = window.confirm(
      'Leaving this workspace will switch your browser to local guest mode. You can re-enter your code anytime. Continue?'
    );
    if (confirmLeave) {
      leaveWorkspace();
      setShowModal(false);
    }
  };

  if (isGuestMode) {
    return null;
  }

  return (
    <>
      <div className={`sync-banner ${isGuestMode ? 'guest' : 'synced'}`}>
        <div className="banner-content">
          <span className="banner-icon">🔑</span>
          <span className="banner-text">
            Workspace Code: <strong className="code-badge">{workspaceCode}</strong>
          </span>
          <button className="banner-btn copy" onClick={handleCopyCode}>
            {copied ? '✅ Copied!' : '📋 Copy Code'}
          </button>
          <button className="banner-btn switch" onClick={() => { setMode('options'); setShowModal(true); }}>
            🔄 Switch / Join Code
          </button>
          <button className="banner-btn signout" onClick={handleLeave}>
            Leave Workspace
          </button>
        </div>
      </div>

      {showModal && (
        <div className="sync-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="sync-modal-card" onClick={e => e.stopPropagation()}>
            <div className="sync-modal-header">
              <h3>🔑 Workspace Code Sync</h3>
              <button className="close-btn" onClick={() => setShowModal(false)}>×</button>
            </div>

            {mode === 'created' && newlyCreatedCode && (
              <div className="created-state">
                <div className="success-icon">🎉</div>
                <h4>Your New Workspace Code Created!</h4>
                <div className="code-display-box" onClick={handleCopyCode}>
                  <span className="code-value">{newlyCreatedCode}</span>
                  <button className="copy-code-btn">{copied ? '✅ Copied' : '📋 Copy'}</button>
                </div>
                <p className="code-warning">
                  ⚠️ <strong>Save this code!</strong> Type this exact code into any other browser or PC to access the identical workflow.
                </p>
                <button
                  className="banner-btn primary"
                  onClick={() => { setShowModal(false); setMode('options'); }}
                >
                  Start Using Workspace ➔
                </button>
              </div>
            )}

            {mode === 'join' && (
              <form onSubmit={handleJoin} className="sync-auth-form">
                <p className="auth-instructions">
                  Enter the 6-character Workspace Code from your other device to load your synchronized workspace.
                </p>

                {errorMessage && <div className="auth-error-alert">⚠️ {errorMessage}</div>}

                <div className="form-group">
                  <label htmlFor="workspace-code-input">WORKSPACE CODE</label>
                  <input
                    id="workspace-code-input"
                    type="text"
                    className="sync-input code-input"
                    placeholder="e.g. X7K9QP"
                    maxLength={10}
                    value={inputCode}
                    onChange={e => setInputCode(e.target.value.toUpperCase())}
                    required
                    autoFocus
                  />
                </div>

                <div className="modal-actions">
                  <button type="submit" className="sync-submit-btn" disabled={isSubmitting}>
                    {isSubmitting ? 'Joining...' : 'Join Workspace 🚀'}
                  </button>
                  <button type="button" className="banner-btn secondary" onClick={() => setMode('options')}>
                    Back
                  </button>
                </div>
              </form>
            )}

            {mode === 'options' && (
              <div className="options-state">
                <p className="auth-instructions">
                  Use Workspace Codes to sync your presentation decks, audio playlists, and media seamlessly across any browser or PC without emails or passwords.
                </p>

                <div className="options-buttons">
                  <button className="option-card-btn primary" onClick={handleCreate} disabled={isSubmitting}>
                    <span className="btn-title">➕ Create New Workspace Code</span>
                    <span className="btn-desc">Generates a unique 6-character code for your presentations</span>
                  </button>

                  <button className="option-card-btn secondary" onClick={() => setMode('join')}>
                    <span className="btn-title">🔗 Join Existing Workspace Code</span>
                    <span className="btn-desc">Enter a code from your other device to sync it here</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
