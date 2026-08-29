export function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-[14px] border border-alertwash-line bg-alertwash p-5 text-sm text-ink">
      <p className="mb-3 leading-relaxed">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-[9px] bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink/85"
      >
        다시 시도
      </button>
    </div>
  );
}
