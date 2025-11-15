import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';
import { useToast } from '../../components/ToastContext';

const formatBytes = (bytes = 0) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
};

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return '';
  }
};

export default function UploadsManagerPanel() {
  const toast = useToast();
  const [currentPath, setCurrentPath] = useState('');
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newFolderName, setNewFolderName] = useState('');

  const fetchListing = useCallback(
    async (pathValue = '') => {
      setLoading(true);
      setError('');
      try {
        const data = await api.get('/uploads/admin', {
          params: pathValue ? { path: pathValue } : undefined,
        });
        setListing(data);
        setCurrentPath(data?.path || '');
      } catch (err) {
        console.error('Failed to load uploads', err);
        setError(err?.message || 'Failed to load uploads');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchListing('');
  }, [fetchListing]);

  const breadcrumbs = useMemo(() => {
    if (!listing?.breadcrumbs?.length) {
      return [{ label: 'uploads', path: '' }];
    }
    return listing.breadcrumbs;
  }, [listing]);

  const handleOpenFolder = (pathValue) => {
    fetchListing(pathValue);
  };

  const handleGoUp = () => {
    if (!listing?.parent) return;
    fetchListing(listing.parent);
  };

  const handleCreateFolder = async (event) => {
    event.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    try {
      await api.post('/uploads/admin/folder', { parent: currentPath, name: trimmed });
      setNewFolderName('');
      toast.push('Folder created', 'success');
      fetchListing(currentPath);
    } catch (err) {
      toast.push(err?.message || 'Failed to create folder', 'error');
    }
  };

  const handleRename = async (item) => {
    const proposed = window.prompt('Rename item', item.name);
    if (!proposed || proposed === item.name) return;
    try {
      await api.post('/uploads/admin/rename', { path: item.path, newName: proposed });
      toast.push('Item renamed', 'success');
      fetchListing(currentPath);
    } catch (err) {
      toast.push(err?.message || 'Failed to rename item', 'error');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
      const encoded = encodeURIComponent(item.path);
      await api.del(`/uploads/admin?path=${encoded}`);
      toast.push('Item deleted', 'info');
      fetchListing(currentPath);
    } catch (err) {
      toast.push(err?.message || 'Failed to delete item', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-800">Uploads manager</h3>
            <p className="text-sm text-slate-500">
              Browse the <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/public/images</code> directory. Changes apply instantly for all users.
            </p>
            <div className="mt-2 flex flex-wrap gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {breadcrumbs.map((crumb, index) => (
                <button
                  key={crumb.path ?? index}
                  type="button"
                  onClick={() => handleOpenFolder(crumb.path || '')}
                  className={`rounded-full border px-2 py-0.5 ${
                    index === breadcrumbs.length - 1
                      ? 'border-blue-200 bg-blue-50 text-blue-600'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-600'
                  }`}
                >
                  {crumb.label || 'uploads'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fetchListing('')}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-600"
            >
              Root
            </button>
            <button
              type="button"
              disabled={!listing?.parent}
              onClick={handleGoUp}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50 hover:border-blue-200 hover:text-blue-600"
            >
              Go up
            </button>
          </div>
        </div>
        <form onSubmit={handleCreateFolder} className="mt-4 flex flex-wrap gap-2">
          <input
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            placeholder="New folder name"
            className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm focus:border-blue-400 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500"
          >
            Create folder
          </button>
        </form>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">{error}</div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white/60 p-6 text-sm text-slate-500">Loading uploads…</div>
      ) : (
        <div className="space-y-8">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Folders</h4>
              <span className="text-xs text-slate-400">{listing?.directories?.length || 0} folders</span>
            </div>
            {listing?.directories?.length ? (
              <div className="grid gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
                {listing.directories.map((dir) => (
                  <div
                    key={dir.path}
                    className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm transition hover:border-blue-200 hover:shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">{dir.name}</p>
                        <p className="text-xs text-slate-500">{dir.items} items • {formatDate(dir.modified)}</p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenFolder(dir.path)}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-600"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRename(dir)}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-600"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(dir)}
                          className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No folders in this path.</p>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Files</h4>
              <span className="text-xs text-slate-400">{listing?.files?.length || 0} files</span>
            </div>
            {listing?.files?.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {listing.files.map((file) => (
                  <div key={file.path} className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-sm">
                    {file.url && (
                      <button
                        type="button"
                        onClick={() => window.open(file.url, '_blank')}
                        className="block h-40 w-full overflow-hidden bg-slate-100"
                        title="Open in new tab"
                      >
                        <img src={file.url} alt={file.name} className="h-full w-full object-cover transition hover:scale-105" />
                      </button>
                    )}
                    <div className="space-y-2 p-4">
                      <div>
                        <p className="font-semibold text-slate-800">{file.name}</p>
                        <p className="text-xs text-slate-500">
                          {formatBytes(file.size)} • {formatDate(file.modified)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-600"
                        >
                          Open
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRename(file)}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-600"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(file)}
                          className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No files to display.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
