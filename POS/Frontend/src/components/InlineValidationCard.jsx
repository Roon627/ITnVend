import React from 'react';

export default function InlineValidationCard({
  status = 'not-slip',
  confidence = null,
  extractedText = '',
  onReplace = () => {},
  onRetry = () => {},
  onRequestReview = () => {},
  onContinue = () => {},
  allowContinue = false,
}) {
  const title = status === 'mismatch' ? 'Reference mismatch' : "Upload looks suspicious";
  const accent = status === 'mismatch' ? 'rose' : 'amber';

  return (
    <div className={`rounded-lg border border-${accent}-200 bg-${accent}-50 p-4 text-sm text-${accent}-700`} role="status">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-semibold text-base text-gray-800">{title}</div>
          <div className="mt-1 text-xs text-gray-600">
            {confidence && Number.isFinite(confidence) ? `OCR confidence: ${Math.round(confidence)}%` : 'Low OCR confidence'}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onReplace} className="px-3 py-1 rounded bg-white border text-xs">Replace image</button>
          <button onClick={onRetry} className="px-3 py-1 rounded bg-blue-600 text-white text-xs">Retry OCR</button>
        </div>
      </div>

      <div className="mt-3 text-xs text-gray-700">
        <div className="font-semibold mb-1">OCR excerpt</div>
        <div className="whitespace-pre-wrap max-h-28 overflow-y-auto rounded bg-white p-2 text-xs text-gray-700">{extractedText || '(no text found)'}</div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={onRequestReview} className="px-3 py-1 rounded bg-white border text-xs">Request manual review</button>
          {allowContinue && (
            <button onClick={onContinue} className="px-3 py-1 rounded bg-emerald-600 text-white text-xs">Continue anyway</button>
          )}
        </div>
      </div>
    </div>
  );
}
