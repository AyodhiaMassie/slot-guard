import { useEffect, useState } from 'react';

export function useClock(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    const update = () => setNow(Date.now());
    window.addEventListener('focus', update);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, []);
  return now;
}
