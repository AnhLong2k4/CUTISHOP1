export const inputClass = 'w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm';
export const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500';
export const primaryButton =
  'rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50';
export const ghostButton =
  'rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:border-brand-400 hover:text-brand-600';

export function LoadingState({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12" role="status">
      <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
      <span className="ml-3 text-sm text-neutral-500">{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-center" role="alert">
      <p className="text-sm text-red-700">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={`${primaryButton} mt-3`}>
          Thử lại
        </button>
      )}
    </div>
  );
}
