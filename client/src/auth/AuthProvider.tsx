import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, createApi, errorMessage, loginRequest, profileRequest } from '../api/client';
import type { User } from '../types';

const storageKey = 'slotguard.session';
interface Session {
  token: string;
  expiresAt: number;
}

function saveSession(session: Session | null): void {
  try {
    if (session) sessionStorage.setItem(storageKey, JSON.stringify(session));
    else sessionStorage.removeItem(storageKey);
  } catch {
    // Private browsing can disable storage; the current in-memory session still works.
  }
}

function readSession(): Session | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    if (
      typeof value === 'object' &&
      value !== null &&
      'token' in value &&
      'expiresAt' in value &&
      typeof value.token === 'string' &&
      typeof value.expiresAt === 'number' &&
      value.expiresAt > Date.now()
    ) {
      return { token: value.token, expiresAt: value.expiresAt };
    }
  } catch {
    // Corrupt saved state must never be treated as an authenticated identity.
  }
  saveSession(null);
  return null;
}

interface AuthState {
  user: User | null;
  status: 'checking' | 'authenticated' | 'anonymous' | 'unavailable';
  message: string;
  api: ReturnType<typeof createApi>;
  login: (email: string, password: string, signal?: AbortSignal) => Promise<void>;
  logout: () => void;
  retry: () => void;
}
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [savedSession] = useState(readSession);
  const [session, setSession] = useState(savedSession);
  const activeSession = useRef(session);
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthState['status']>(
    savedSession ? 'checking' : 'anonymous',
  );
  const [message, setMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const clearSession = useCallback((message = '') => {
    activeSession.current = null;
    setSession(null);
    saveSession(null);
    setUser(null);
    setStatus('anonymous');
    setMessage(message);
  }, []);

  const expire = useCallback(
    (token: string) => {
      // A late 401 from an earlier account must not sign out a newly authenticated user.
      if (activeSession.current?.token === token)
        clearSession('Your session has expired. Please sign in again.');
    },
    [clearSession],
  );

  useEffect(() => {
    if (!savedSession || activeSession.current?.token !== savedSession.token) return;
    const controller = new AbortController();
    setStatus('checking');
    profileRequest(savedSession.token, controller.signal)
      .then((profile) => {
        if (controller.signal.aborted || activeSession.current?.token !== savedSession.token)
          return;
        setUser(profile);
        setStatus('authenticated');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || activeSession.current?.token !== savedSession.token)
          return;
        if (error instanceof ApiError && error.status === 401) expire(savedSession.token);
        else {
          setStatus('unavailable');
          setMessage(errorMessage(error));
        }
      });
    return () => controller.abort();
  }, [savedSession, retryCount, expire]);

  useEffect(() => {
    if (!session) return;
    const checkExpiry = () => {
      if (session.expiresAt <= Date.now()) expire(session.token);
    };
    const timer = setTimeout(checkExpiry, Math.max(0, session.expiresAt - Date.now()));
    window.addEventListener('focus', checkExpiry);
    document.addEventListener('visibilitychange', checkExpiry);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', checkExpiry);
      document.removeEventListener('visibilitychange', checkExpiry);
    };
  }, [session, expire]);

  const login = useCallback(async (email: string, password: string, signal?: AbortSignal) => {
    const result = await loginRequest(email, password, signal);
    if (signal?.aborted) return;
    const nextSession = { token: result.token, expiresAt: Date.now() + result.expires_in * 1000 };
    activeSession.current = nextSession;
    setSession(nextSession);
    saveSession(nextSession);
    setUser(result.user);
    setMessage('');
    setStatus('authenticated');
  }, []);

  const api = useMemo(
    () => createApi(session?.token ?? '', () => expire(session?.token ?? '')),
    [session, expire],
  );
  const value: AuthState = {
    user,
    status,
    message,
    api,
    login,
    logout: () => clearSession(),
    retry: () => setRetryCount((count) => count + 1),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth requires AuthProvider');
  return context;
}
