import { useEffect, useState } from 'react';
import { errorMessage } from '../api/client';

export function useResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({
    data: null,
    loading: true,
    error: null,
  });
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ data: null, loading: false, error: errorMessage(error) });
      });
    return () => controller.abort();
  }, [load]);
  return state;
}
