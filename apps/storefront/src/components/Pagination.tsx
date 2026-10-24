export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Phân trang">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40"
      >
        ← Trước
      </button>
      <span className="text-sm text-neutral-600">
        Trang {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40"
      >
        Sau →
      </button>
    </nav>
  );
}
