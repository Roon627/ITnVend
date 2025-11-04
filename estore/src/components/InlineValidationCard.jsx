import React from 'react';

export default function InlineValidationCard({
  status = 'not-slip',
  confidence = null,
  extractedText = '',
  onReplace = () => {},
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
        </div>
      </div>

      <div className="mt-3 text-xs text-gray-700">
        <div className="font-semibold mb-1">OCR excerpt</div>
        <div className="whitespace-pre-wrap max-h-28 overflow-y-auto rounded bg-white p-2 text-xs text-gray-700">{extractedText || '(no text found)'}</div>
      </div>

      <div className="mt-3 text-xs text-gray-500">Contact support if you need help verifying the slip.</div>
    </div>
  );
}
