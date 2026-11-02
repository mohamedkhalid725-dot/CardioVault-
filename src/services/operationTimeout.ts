/** Bound a wait without pretending to cancel the underlying operation. */
export function withOperationTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
  onLateSettlement?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      onTimeout?.();
      reject(new Error(message));
    }, Math.max(1, timeoutMs));
    promise.then(
      value => { clearTimeout(timer); if (timedOut) onLateSettlement?.(); resolve(value); },
      error => { clearTimeout(timer); if (timedOut) onLateSettlement?.(); reject(error); },
    );
  });
}
