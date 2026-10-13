import { useEffect, useRef, useState } from 'react';

export function useMutation() {
  const [pending, setPending] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function run<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    onSuccess: (result: T) => void,
    onError: (error: unknown) => void,
  ): Promise<void> {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    try {
      const result = await operation(controller.signal);
      if (!controller.signal.aborted) onSuccess(result);
    } catch (error) {
      if (!controller.signal.aborted) onError(error);
    } finally {
      if (!controller.signal.aborted) setPending(false);
      if (active.current === controller) active.current = null;
    }
  }
  return { pending, run };
}
