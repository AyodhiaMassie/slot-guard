import { useEffect, useRef, useState, type FormEvent } from 'react';
import { errorMessage } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Icon, Logo } from '../components/Icon';

const demoAccounts = [
  {
    name: 'Alex Morgan',
    label: 'Alex',
    role: 'Student',
    email: 'alex.student@slotguard.demo',
    password: 'DemoStudent!2026',
  },
  {
    name: 'Sam Rivera',
    label: 'Sam',
    role: 'Student',
    email: 'sam.student@slotguard.demo',
    password: 'DemoStudent!2026',
  },
  {
    name: 'Dr Maya Chen',
    label: 'Maya',
    role: 'Tutor',
    email: 'maya.tutor@slotguard.demo',
    password: 'DemoTutor!2026',
  },
  {
    name: 'Dr Noah Patel',
    label: 'Noah',
    role: 'Tutor',
    email: 'noah.tutor@slotguard.demo',
    password: 'DemoTutor!2026',
  },
];

export function LoginPage() {
  const { login, message } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [slow, setSlow] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(timer);
  }, [pending]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) {
      setError('Enter a valid email address and your password.');
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setError('');
    setPending(true);
    try {
      await login(email, password, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) setError(errorMessage(error));
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <Logo light />
        <div className="story-content">
          <span className="eyebrow story-eyebrow">
            <span className="online-dot" /> A little time. A lot of possibility.
          </span>
          <h1>
            A little guidance.
            <br />A clear <em>next step.</em>
          </h1>
          <p>Find your tutor, make time for a conversation, and move forward with confidence.</p>
          <div className="story-benefits">
            <span>
              <Icon name="clock" />
              30-minute consultations
            </span>
            <span>
              <Icon name="users" />
              Your people, your pace
            </span>
            <span>
              <Icon name="shield" />A place in the schedule, secured
            </span>
          </div>
        </div>
        <div className="story-footer">
          <span>Built for students. Designed for possibility.</span>
          <div className="abstract-orbit" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <span className="eyebrow">WELCOME TO SLOTGUARD</span>
          <h2>Let’s make time.</h2>
          <p className="muted">Sign in to book a consultation or manage your availability.</p>
          {message && (
            <p className="inline-alert" role="status">
              {message}
            </p>
          )}
          <form onSubmit={submit} noValidate>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                maxLength={254}
                placeholder="you@university.edu"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={pending}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={pending}
                required
              />
            </div>
            {error && (
              <p className="inline-alert" role="alert">
                {error}
              </p>
            )}
            <button
              className="button button-primary sign-in-button"
              disabled={pending}
              type="submit"
            >
              {pending ? (
                <>
                  <span className="spinner spinner-small" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in <Icon name="arrow" />
                </>
              )}
            </button>
            {slow && (
              <p className="connection-note" role="status">
                Connecting to SlotGuard. This may take a moment.
              </p>
            )}
          </form>
          <div className="demo-heading">
            <span />
            Explore the demo
            <span />
          </div>
          <p className="demo-intro">Choose an account to fill your details, then sign in.</p>
          <div className="demo-grid">
            {['Student', 'Tutor'].map((role) => (
              <section className="demo-group" key={role}>
                <h3>
                  <Icon name={role === 'Student' ? 'book' : 'users'} />
                  {role}
                </h3>
                {demoAccounts
                  .filter((account) => account.role === role)
                  .map((account) => (
                    <button
                      key={account.email}
                      className="demo-account"
                      aria-label={`Use ${account.label} (${role})`}
                      disabled={pending}
                      onClick={() => {
                        setEmail(account.email);
                        setPassword(account.password);
                        setError('');
                      }}
                    >
                      <strong>
                        {account.name}
                        <Icon name="arrow" />
                      </strong>
                      <span>{account.email}</span>
                    </button>
                  ))}
                <p className="demo-password">
                  Password:{' '}
                  <code>{role === 'Student' ? 'DemoStudent!2026' : 'DemoTutor!2026'}</code>
                </p>
              </section>
            ))}
          </div>
          <p className="demo-disclaimer">
            <span className="online-dot" />
            Fictional university accounts. Feel free to explore.
          </p>
        </div>
      </section>
    </main>
  );
}
