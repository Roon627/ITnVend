import React from 'react';

export default function ThemePanel({ themeOptions, activeTheme, setTheme }) {
  return (
    <div className="bg-white p-6 rounded-md shadow space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-800">Interface theme</h3>
            <p className="text-sm text-gray-500">Choose a colour palette for the back-office experience. Preference is stored per browser.</p>
          </div>
          <span className="text-xs uppercase tracking-wide text-gray-400">Preview</span>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {themeOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => setTheme(option.id)}
              aria-pressed={activeTheme === option.id}
              className={`flex flex-col justify-between rounded-xl border px-4 py-4 text-left transition focus:outline-none ${activeTheme === option.id ? 'border-blue-500' : 'border-gray-200'}`}
              type="button"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold">{option.name}</p>
                  <p className="text-xs text-gray-500">{option.description}</p>
                </div>
                <div className="flex w-28 border rounded overflow-hidden">
                  {option.preview.map((hex, i) => (
                    <div key={hex + i} style={{ background: hex }} className="h-6 flex-1" />
                  ))}
                </div>
              </div>
              <span className={`text-xs font-semibold ${activeTheme === option.id ? 'text-blue-600' : 'text-gray-400'}`}>
                {activeTheme === option.id ? 'Active theme' : 'Select theme'}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
