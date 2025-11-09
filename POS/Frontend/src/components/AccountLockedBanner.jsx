import React from 'react';

export default function AccountLockedBanner({ message }) {
  if (!message) return null;
  return (
    <div className="rounded-md bg-amber-50 border border-amber-100 p-4 text-amber-800">
      <strong className="font-semibold">Account locked</strong>
      <div className="mt-1 text-sm">{message}</div>
    </div>
  );
}
