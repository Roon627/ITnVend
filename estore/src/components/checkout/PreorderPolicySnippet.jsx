export default function PreorderPolicySnippet() {
  return (
    <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4 text-xs text-rose-700 shadow-sm">
      <p className="font-semibold text-rose-600">Preorder policy</p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-rose-500">
        <li>Arrival estimates are shared via email once freight is confirmed.</li>
        <li>Preorders require full payment via bank transfer or QR.</li>
        <li>Need to cancel? Let us know before we dispatch from the warehouse.</li>
      </ul>
    </div>
  );
}
