import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './LoginPage.css';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const success = await login(username, password);
      if (!success) {
        setErrorMessage('Invalid username or password.');
        setIsSubmitting(false);
      }
    } catch {
      setErrorMessage('Invalid username or password.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page-root">
      <div className="login-card">
        <div className="login-header">
          <h2>Welcome back!</h2>
          <p className="login-subtitle">We're so excited to see you again!</p>
        </div>

        {errorMessage && (
          <div className="login-error-alert">
            <span>⚠️ {errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username-field">ACCOUNT INFORMATION</label>
            <div className="input-wrapper">
              <input
                id="username-field"
                type="text"
                className="login-input"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password-field">PASSWORD</label>
            <div className="input-wrapper">
              <input
                id="password-field"
                type={showPassword ? 'text' : 'password'}
                className="login-input login-input-pass"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="toggle-pass-btn"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label="Toggle password visibility"
              >
                {showPassword ? '👁️' : '🙈'}
              </button>
            </div>
            <a href="#forgot" className="login-link forgot-link" onClick={e => e.preventDefault()}>
              Forgot your password?
            </a>
          </div>

          <button type="submit" className="login-submit-btn" disabled={isSubmitting}>
            {isSubmitting ? 'Authenticating...' : 'Log In'}
          </button>

          <div className="login-register-prompt">
            Need an account?{' '}
            <a href="#register" className="login-link register-link" onClick={e => e.preventDefault()}>
              Register
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

