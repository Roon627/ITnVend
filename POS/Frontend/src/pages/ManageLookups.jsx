import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FaTrademark,
  FaBoxOpen,
  FaPalette,
  FaTags,
  FaPlus,
  FaTrash,
  FaCheck,
  FaTimes,
  FaPencilAlt,
  FaSearch,
  FaChevronDown,
  FaChevronUp,
  FaUserFriends,
  FaTruck,
  FaShieldAlt,
} from 'react-icons/fa';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import CategoryTree, { deriveBreadcrumb } from '../components/CategoryTree';

const LOOKUP_KEYS = ['brands', 'materials', 'colors', 'tags', 'audiences', 'deliveryTypes', 'warrantyTerms'];

const initialLookupState = LOOKUP_KEYS.reduce(
  (acc, key) => ({
    ...acc,
    [key]: [],
  }),
  {}
);

const CUSTOM_LOOKUP_CONFIG = {
  audiences: { route: '/audiences', label: 'Audience', icon: FaUserFriends },
  deliveryTypes: { route: '/delivery-types', label: 'Delivery type', icon: FaTruck },
  warrantyTerms: { route: '/warranty-terms', label: 'Warranty term', icon: FaShieldAlt },
};

const EditableList = ({
  title,
  items = [],
  onUpdate,
  onDelete,
  onAdd,
  Icon,
  accent = {},
  collapsed = false,
  onToggle,
  showPulse = false,
}) => {
  const [drafts, setDrafts] = useState({});
  const [newItem, setNewItem] = useState('');
  const [editingId, setEditingId] = useState(null);

  const getItemKey = useCallback((item) => {
    if (!item) return '';
    return item.lookupId ?? item.id ?? item.name ?? '';
  }, []);

  useEffect(() => {
    setDrafts({});
    setEditingId(null);
  }, [items]);

  const themeBase = {
    gradient: 'from-sky-500 via-blue-500 to-indigo-500',
    icon: 'text-indigo-600',
    pill: 'bg-indigo-100 text-indigo-700',
    pulse: 'ring-2 ring-indigo-200/60 shadow-lg shadow-indigo-100/40',
  };
  const tone = { ...themeBase, ...accent };

  const itemsSorted = Array.isArray(items) ? [...items].sort((a, b) => (a.name || '').localeCompare(b.name || '')) : [];
  const count = itemsSorted.length;
  const isEmpty = count === 0;
  const singular = title && title.endsWith('s') ? title.slice(0, -1) : title || 'item';

  const clearDraft = (key) =>
    setDrafts((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const handleAdd = () => {
    const trimmed = newItem.trim();
    if (!trimmed) return;
    if (onAdd) onAdd(trimmed);
    setNewItem('');
  };

  return (
    <div className={`group relative flex h-full flex-col rounded-2xl border border-slate-200 bg-white/95 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${showPulse ? tone.pulse : ''}`}>
      <div className={`h-1 w-full bg-gradient-to-r ${tone.gradient}`} />
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && <Icon className={`text-lg sm:text-xl ${tone.icon}`} />}
          <h2 className="truncate text-base font-semibold text-slate-800 sm:text-lg">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${tone.pill}`}>
            <span aria-hidden="true">•</span>
            {count}
          </span>
          {onToggle && (
            <button
              type="button"
              aria-expanded={!collapsed}
              onClick={onToggle}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-white/40 text-slate-500 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300"
            >
              {collapsed ? <FaChevronDown size={14} /> : <FaChevronUp size={14} />}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 p-3">
        {collapsed ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
            Collapsed
          </div>
        ) : (
          <div className="flex h-full flex-col space-y-2">
            {isEmpty ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-slate-500">
                <div className="mb-3 text-slate-300">
                  {Icon && <Icon className="text-4xl sm:text-5xl" />}
                </div>
                <p className="text-sm font-medium">No {singular.toLowerCase()}s yet</p>
                <p className="text-xs text-slate-400">Add your first entry below to populate this list.</p>
              </div>
            ) : (
              <div className="relative flex-1 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/70 shadow-inner">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white via-white/60 to-transparent" aria-hidden="true" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white via-white/60 to-transparent" aria-hidden="true" />
                <div className="max-h-72 overflow-y-auto overflow-x-hidden space-y-2 px-2 py-3">
                  {itemsSorted.map((item) => {
                    const itemKey = getItemKey(item);
                    const readOnly = !!item.readOnly;
                    const currentValue = drafts[itemKey] ?? item.name ?? '';
                    return (
                      <div key={itemKey || item.name} className="group/item flex items-center justify-between gap-2">
                        {editingId === itemKey ? (
                          <>
                            <input
                              autoFocus
                              type="text"
                              value={currentValue}
                              onChange={(event) => setDrafts((prev) => ({ ...prev, [itemKey]: event.target.value }))}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  const nextName = (drafts[itemKey] ?? item.name ?? '').trim();
                                  if (!nextName) return;
                                  onUpdate?.(item.lookupId ?? item.id, nextName, item);
                                  setEditingId(null);
                                  clearDraft(itemKey);
                                }
                                if (event.key === 'Escape') {
                                  setEditingId(null);
                                  clearDraft(itemKey);
                                }
                              }}
                              className="w-full max-w-[220px] rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            />
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const draftValue = (drafts[itemKey] ?? item.name ?? '').trim();
                                  if (!draftValue) return;
                                  onUpdate?.(item.lookupId ?? item.id, draftValue, item);
                                  setEditingId(null);
                                  clearDraft(itemKey);
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-white transition hover:bg-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-emerald-300"
                                title="Save"
                              >
                                <FaCheck size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null);
                                  clearDraft(itemKey);
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-500 transition hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-300"
                                title="Cancel"
                              >
                                <FaTimes size={12} />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 truncate text-xs font-medium text-slate-700">
                              {item.name}
                              {readOnly && (
                                <span className="ml-2 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                  Base
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-1 opacity-0 transition group-hover/item:opacity-100">
                              <button
                                type="button"
                                onClick={() => {
                                  if (readOnly) return;
                                  clearDraft(itemKey);
                                  setEditingId(itemKey);
                                }}
                                disabled={readOnly}
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-md border px-0 text-slate-500 transition ${
                                  readOnly
                                    ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                                    : 'border-slate-200 bg-white hover:border-blue-200 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-300'
                                }`}
                                title={readOnly ? 'Built-in value' : 'Edit'}
                              >
                                <FaPencilAlt size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (readOnly) return;
                                  onDelete?.(item.lookupId ?? item.id, item);
                                }}
                                disabled={readOnly}
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-md border px-0 transition ${
                                  readOnly
                                    ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                                    : 'border-red-200 bg-red-50 text-red-600 hover:border-red-300 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-200'
                                }`}
                                title={readOnly ? 'Built-in value' : 'Delete'}
                              >
                                <FaTrash size={12} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-auto rounded-2xl border border-slate-100 bg-white/95 px-3 py-3 shadow-sm">
              <div className="flex flex-col items-center gap-2">
                <input
                  type="text"
                  value={newItem}
                  onChange={(event) => setNewItem(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAdd();
                    }
                  }}
                  placeholder={`Add new ${singular ? singular.toLowerCase() : 'item'}...`}
                  className="w-full max-w-[220px] text-sm py-1.5 px-2 rounded-md border border-gray-200 bg-gray-50 text-slate-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!newItem.trim()}
                  className="mt-2 w-full max-w-[220px] rounded-md bg-blue-600 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                  title="Add"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default function ManageLookups() {
  const [lookups, setLookups] = useState(initialLookupState);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categorySearch, setCategorySearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [rootDraft, setRootDraft] = useState('');
  const [collapsed, setCollapsed] = useState(
    LOOKUP_KEYS.reduce((acc, key) => ({ ...acc, [key]: false }), {})
  );
  const [pulse, setPulse] = useState(
    LOOKUP_KEYS.reduce((acc, key) => ({ ...acc, [key]: false }), {})
  );
  const categoryTreeRef = useRef(null);
  const rootInputRef = useRef(null);
  const toast = useToast();
  const breadcrumb = useMemo(() => deriveBreadcrumb(categories, selectedCategoryId), [categories, selectedCategoryId]);
  const accentThemes = useMemo(() => ({
    brands: {
      gradient: 'from-sky-500 via-blue-500 to-indigo-500',
      icon: 'text-blue-600',
      pill: 'bg-blue-100 text-blue-700',
      focus: 'focus:ring-blue-500 focus:ring-2 focus:border-blue-400',
      button: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500/40',
      pulse: 'ring-2 ring-blue-200/60 shadow-lg shadow-blue-100/40',
    },
    materials: {
      gradient: 'from-indigo-500 via-violet-500 to-purple-500',
      icon: 'text-indigo-600',
      pill: 'bg-indigo-100 text-indigo-700',
      focus: 'focus:ring-indigo-500 focus:ring-2 focus:border-indigo-400',
      button: 'bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500/40',
      pulse: 'ring-2 ring-indigo-200/60 shadow-lg shadow-indigo-100/40',
    },
    colors: {
      gradient: 'from-emerald-400 via-teal-500 to-green-500',
      icon: 'text-emerald-600',
      pill: 'bg-emerald-100 text-emerald-700',
      focus: 'focus:ring-emerald-500 focus:ring-2 focus:border-emerald-400',
      button: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500/40',
      pulse: 'ring-2 ring-emerald-200/60 shadow-lg shadow-emerald-100/40',
    },
    tags: {
      gradient: 'from-rose-400 via-pink-500 to-fuchsia-500',
      icon: 'text-rose-600',
      pill: 'bg-rose-100 text-rose-700',
      focus: 'focus:ring-rose-500 focus:ring-2 focus:border-rose-400',
      button: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-500/40',
      pulse: 'ring-2 ring-rose-200/60 shadow-lg shadow-rose-100/40',
    },
    audiences: {
      gradient: 'from-amber-400 via-orange-400 to-rose-400',
      icon: 'text-amber-600',
      pill: 'bg-amber-100 text-amber-700',
      focus: 'focus:ring-amber-500 focus:ring-2 focus:border-amber-400',
      button: 'bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-2 focus-visible:ring-amber-400/40',
      pulse: 'ring-2 ring-amber-200/60 shadow-lg shadow-amber-100/40',
    },
    deliveryTypes: {
      gradient: 'from-emerald-400 via-green-500 to-lime-400',
      icon: 'text-emerald-600',
      pill: 'bg-emerald-100 text-emerald-700',
      focus: 'focus:ring-emerald-500 focus:ring-2 focus:border-emerald-400',
      button: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-400/40',
      pulse: 'ring-2 ring-emerald-200/60 shadow-lg shadow-emerald-100/40',
    },
    warrantyTerms: {
      gradient: 'from-slate-500 via-indigo-500 to-blue-500',
      icon: 'text-indigo-600',
      pill: 'bg-indigo-100 text-indigo-700',
      focus: 'focus:ring-indigo-500 focus:ring-2 focus:border-indigo-400',
      button: 'bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500/40',
      pulse: 'ring-2 ring-indigo-200/60 shadow-lg shadow-indigo-100/40',
    },
  }), []);

  // detect quick-attribute list changes to trigger a pulse animation
  const prevCounts = useRef(
    LOOKUP_KEYS.reduce((acc, key) => ({ ...acc, [key]: 0 }), {})
  );
  const lookupCounts = useMemo(
    () =>
      LOOKUP_KEYS.reduce(
        (acc, key) => ({ ...acc, [key]: (lookups[key] || []).length }),
        {}
      ),
    [lookups]
  );
  useEffect(() => {
    Object.keys(lookupCounts).forEach((k) => {
      const prev = prevCounts.current[k] || 0;
      const next = lookupCounts[k] || 0;
      if (next !== prev) {
        setPulse((p) => ({ ...p, [k]: true }));
        window.setTimeout(() => setPulse((p) => ({ ...p, [k]: false })), 700);
      }
      prevCounts.current[k] = next;
    });
  }, [lookupCounts]);

  const fetchLookups = useCallback(async () => {
    setLoading(true);
    try {
      const [lu, cats] = await Promise.all([
        api.get('/lookups'),
        api.get('/categories/tree', { params: { depth: 3 } })
      ]);
      const normalized = LOOKUP_KEYS.reduce(
        (acc, key) => ({ ...acc, [key]: Array.isArray(lu?.[key]) ? lu[key] : [] }),
        {}
      );
      setLookups(normalized);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch (err) {
      console.error('Failed to load lookup data', err);
      toast.push('Failed to load lookup data', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  useEffect(() => {
    if (!selectedCategoryId) return;
    const path = deriveBreadcrumb(categories, selectedCategoryId);
    if (!path.length) {
      setSelectedCategoryId(null);
    }
  }, [categories, selectedCategoryId]);

  const handleGenericUpdate = async (type, id, name) => {
    try {
      await api.put(`/${type}/${id}`, { name });
      toast.push(`${type.slice(0, -1)} updated`, 'success');
      fetchLookups();
    } catch (err) {
      console.error(`Failed to update ${type.slice(0, -1)}`, err);
      toast.push(`Failed to update ${type.slice(0, -1)}`, 'error');
    }
  };

  const handleGenericDelete = async (type, id) => {
    if (!window.confirm(`Are you sure you want to delete this ${type.slice(0, -1)}? This might affect existing products.`)) return;
    try {
      await api.del(`/${type}/${id}`);
      toast.push(`${type.slice(0, -1)} deleted`, 'success');
      fetchLookups();
    } catch (err) {
      console.error(`Failed to delete ${type.slice(0, -1)}`, err);
      toast.push(`Failed to delete ${type.slice(0, -1)}`, 'error');
    }
  };

  const handleGenericAdd = async (type, name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      toast.push(`Enter a ${type.slice(0, -1)} name`, 'warning');
      return;
    }
    try {
      await api.post(`/${type}`, { name: trimmed });
      toast.push(`${type.slice(0, -1)} added`, 'success');
      fetchLookups();
    } catch (err) {
      console.error(`Failed to add ${type.slice(0, -1)}`, err);
      toast.push(`Failed to add ${type.slice(0, -1)}`, 'error');
    }
  };

  const handleCustomLookupAdd = async (key, name) => {
    const trimmed = (name || '').trim();
    const config = CUSTOM_LOOKUP_CONFIG[key];
    if (!config) return;
    if (!trimmed) {
      toast.push(`Enter a ${config.label.toLowerCase()}`, 'warning');
      return;
    }
    try {
      await api.post(config.route, { name: trimmed });
      toast.push(`${config.label} added`, 'success');
      fetchLookups();
    } catch (err) {
      console.error(`Failed to add ${config.label}`, err);
      toast.push(err?.data?.error || `Failed to add ${config.label}`, 'error');
    }
  };

  const handleCustomLookupUpdate = async (key, id, name) => {
    const config = CUSTOM_LOOKUP_CONFIG[key];
    if (!config) return;
    const lookupId = parseInt(id, 10);
    if (!Number.isFinite(lookupId)) {
      toast.push(`Invalid ${config.label.toLowerCase()} id`, 'error');
      return;
    }
    const trimmed = (name || '').trim();
    if (!trimmed) {
      toast.push(`${config.label} name is required`, 'warning');
      return;
    }
    try {
      await api.put(`${config.route}/${lookupId}`, { name: trimmed });
      toast.push(`${config.label} updated`, 'success');
      fetchLookups();
    } catch (err) {
      console.error(`Failed to update ${config.label}`, err);
      toast.push(err?.data?.error || `Failed to update ${config.label}`, 'error');
    }
  };

  const handleCustomLookupDelete = async (key, id) => {
    const config = CUSTOM_LOOKUP_CONFIG[key];
    if (!config) return;
    const lookupId = parseInt(id, 10);
    if (!Number.isFinite(lookupId)) return;
    if (!window.confirm(`Delete this ${config.label.toLowerCase()}?`)) return;
    try {
      await api.del(`${config.route}/${lookupId}`);
      toast.push(`${config.label} removed`, 'success');
      fetchLookups();
    } catch (err) {
      console.error(`Failed to delete ${config.label}`, err);
      toast.push(err?.data?.error || `Failed to delete ${config.label}`, 'error');
    }
  };

  const handleCategorySelect = useCallback((node) => {
    setSelectedCategoryId(node?.id || null);
  }, []);

  const handleAddCategory = useCallback(async (parentId, name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      toast.push('Category name is required', 'warning');
      return;
    }
    try {
      const payload = parentId ? { name: trimmed, parentId } : { name: trimmed };
      const created = await api.post('/categories', payload);
      toast.push('Category added', 'success');
      await fetchLookups();
      if (created && (created.id || created.categoryId)) {
        setSelectedCategoryId(created.id || created.categoryId);
      }
    } catch (err) {
      console.error('Failed to add category', err);
      toast.push(err?.message || 'Failed to add category', 'error');
    }
  }, [fetchLookups, toast]);

  const handleTreeAdd = useCallback((parentId) => {
    const name = window.prompt('New category name');
    if (!name) return;
    void handleAddCategory(parentId, name);
  }, [handleAddCategory]);

  const handleRenameCategory = useCallback(async (id, newName) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) {
      toast.push('Category name is required', 'warning');
      return;
    }
    try {
      await api.put(`/categories/${id}`, { name: trimmed });
      toast.push('Category updated', 'success');
      await fetchLookups();
      setSelectedCategoryId(id);
    } catch (err) {
      console.error('Failed to update category', err);
      toast.push(err?.message || 'Failed to update category', 'error');
    }
  }, [fetchLookups, toast]);

  const handleDeleteCategory = useCallback(async (node) => {
    if (!node?.id) return;
    if (!window.confirm('Delete this category? This might affect existing products.')) return;
    try {
      await api.del(`/categories/${node.id}`);
      toast.push('Category deleted', 'success');
      await fetchLookups();
      if (selectedCategoryId === node.id) {
        setSelectedCategoryId(null);
      }
    } catch (err) {
      console.error('Failed to delete category', err);
      toast.push(err?.message || 'Failed to delete category', 'error');
    }
  }, [fetchLookups, selectedCategoryId, toast]);

  const handleReorderCategory = useCallback((dragId, dropId) => {
    if (!dragId || !dropId) return;
    toast.push('Reorder pending backend support', 'info');
  }, [toast]);

  const handleRootSubmit = useCallback(async () => {
    const trimmed = rootDraft.trim();
    if (!trimmed) return;
    await handleAddCategory(null, trimmed);
    setRootDraft('');
  }, [rootDraft, handleAddCategory]);

  const handleExpandAll = useCallback(() => {
    categoryTreeRef.current?.expandAll?.();
  }, []);

  const handleCollapseAll = useCallback(() => {
    categoryTreeRef.current?.collapseAll?.();
  }, []);

  const handleToolbarAddRoot = useCallback(() => {
    if (rootInputRef.current) {
      rootInputRef.current.focus();
      rootInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  const handleSearchChange = useCallback((event) => {
    setCategorySearch(event.target.value);
  }, []);

  const toggleCard = useCallback((key) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /* breadcrumbLabel removed in favor of clickable breadcrumb segments rendered in the toolbar */

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center text-slate-500">
          <div className="animate-spin inline-flex items-center justify-center w-12 h-12 rounded-full border-4 border-slate-200 border-t-blue-500"></div>
          <p className="mt-4 font-medium">Loading lookup data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
                Product hub
              </span>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Manage Lookups</h1>
                <p className="text-sm text-slate-500">Organize your product attributes and maintain consistency across your inventory.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
          <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <label className="relative flex-1 max-w-xl">
                <FaSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  aria-label="Search categories"
                  value={categorySearch}
                  onChange={handleSearchChange}
                  placeholder="Search categories..."
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 pl-9 text-sm text-slate-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  type="search"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  aria-label="Expand all"
                  type="button"
                  onClick={handleExpandAll}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300"
                >
                  Expand all
                </button>
                <button
                  aria-label="Collapse all"
                  type="button"
                  onClick={handleCollapseAll}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300"
                >
                  Collapse all
                </button>
                <button
                  aria-label="Add root"
                  type="button"
                  onClick={handleToolbarAddRoot}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500/40"
                >
                  <FaPlus size={12} />
                  Add root
                </button>
              </div>
            </div>

            {breadcrumb.length > 0 && (
              <nav className="flex flex-wrap items-center gap-1 text-xs font-semibold text-slate-600">
                {breadcrumb.map((crumb, index) => (
                  <React.Fragment key={crumb.id || index}>
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryId(crumb.id || null)}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                    >
                      {crumb.name}
                    </button>
                    {index < breadcrumb.length - 1 && <span className="text-slate-400">›</span>}
                  </React.Fragment>
                ))}
              </nav>
            )}

            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3 shadow-inner">
              <div className="max-h-[55vh] overflow-y-auto overflow-x-hidden px-1">
                <CategoryTree
                  ref={categoryTreeRef}
                  items={categories}
                  selectedId={selectedCategoryId}
                  onSelect={handleCategorySelect}
                  onAdd={handleTreeAdd}
                  onRename={handleRenameCategory}
                  onDelete={handleDeleteCategory}
                  onReorder={handleReorderCategory}
                  searchTerm={categorySearch}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 sm:flex-row sm:items-center">
              <label className="sr-only" htmlFor="new-root-category">New root category</label>
              <input
                id="new-root-category"
                ref={rootInputRef}
                value={rootDraft}
                onChange={(event) => setRootDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleRootSubmit();
                  }
                }}
                placeholder="Add new root category..."
                className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
              <button
                aria-label="Add root category"
                type="button"
                onClick={handleRootSubmit}
                disabled={!rootDraft.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
              >
                <FaPlus size={12} />
                Add category
              </button>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Quick attributes</h2>
              <p className="text-sm text-slate-500">Manage reusable values for faster product setup.</p>
            </div>
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Updates save instantly</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <EditableList
              Icon={FaTrademark}
              title="Brands"
              items={lookups.brands}
              onUpdate={(id, name) => handleGenericUpdate('brands', id, name)}
              onDelete={(id) => handleGenericDelete('brands', id)}
              onAdd={(name) => handleGenericAdd('brands', name)}
              accent={accentThemes.brands}
              collapsed={collapsed.brands}
              onToggle={() => toggleCard('brands')}
              showPulse={pulse.brands}
            />
            <EditableList
              Icon={FaBoxOpen}
              title="Materials"
              items={lookups.materials}
              onUpdate={(id, name) => handleGenericUpdate('materials', id, name)}
              onDelete={(id) => handleGenericDelete('materials', id)}
              onAdd={(name) => handleGenericAdd('materials', name)}
              accent={accentThemes.materials}
              collapsed={collapsed.materials}
              onToggle={() => toggleCard('materials')}
              showPulse={pulse.materials}
            />
            <EditableList
              Icon={FaPalette}
              title="Colors"
              items={lookups.colors}
              onUpdate={(id, name) => handleGenericUpdate('colors', id, name)}
              onDelete={(id) => handleGenericDelete('colors', id)}
              onAdd={(name) => handleGenericAdd('colors', name)}
              accent={accentThemes.colors}
              collapsed={collapsed.colors}
              onToggle={() => toggleCard('colors')}
              showPulse={pulse.colors}
            />
            <EditableList
              Icon={FaTags}
              title="Tags"
              items={lookups.tags}
              onUpdate={(id, name) => handleGenericUpdate('tags', id, name)}
              onDelete={(id) => handleGenericDelete('tags', id)}
              onAdd={(name) => handleGenericAdd('tags', name)}
              accent={accentThemes.tags}
              collapsed={collapsed.tags}
              onToggle={() => toggleCard('tags')}
              showPulse={pulse.tags}
            />
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Experience lookups</h2>
              <p className="text-sm text-slate-500">Audience, delivery, and warranty options – base values are locked, customs editable.</p>
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Base entries marked as “Base”</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <EditableList
              Icon={FaUserFriends}
              title="Audiences"
              items={lookups.audiences}
              onUpdate={(id, name) => handleCustomLookupUpdate('audiences', id, name)}
              onDelete={(id) => handleCustomLookupDelete('audiences', id)}
              onAdd={(name) => handleCustomLookupAdd('audiences', name)}
              accent={accentThemes.audiences}
              collapsed={collapsed.audiences}
              onToggle={() => toggleCard('audiences')}
              showPulse={pulse.audiences}
            />
            <EditableList
              Icon={FaTruck}
              title="Delivery types"
              items={lookups.deliveryTypes}
              onUpdate={(id, name) => handleCustomLookupUpdate('deliveryTypes', id, name)}
              onDelete={(id) => handleCustomLookupDelete('deliveryTypes', id)}
              onAdd={(name) => handleCustomLookupAdd('deliveryTypes', name)}
              accent={accentThemes.deliveryTypes}
              collapsed={collapsed.deliveryTypes}
              onToggle={() => toggleCard('deliveryTypes')}
              showPulse={pulse.deliveryTypes}
            />
            <EditableList
              Icon={FaShieldAlt}
              title="Warranty terms"
              items={lookups.warrantyTerms}
              onUpdate={(id, name) => handleCustomLookupUpdate('warrantyTerms', id, name)}
              onDelete={(id) => handleCustomLookupDelete('warrantyTerms', id)}
              onAdd={(name) => handleCustomLookupAdd('warrantyTerms', name)}
              accent={accentThemes.warrantyTerms}
              collapsed={collapsed.warrantyTerms}
              onToggle={() => toggleCard('warrantyTerms')}
              showPulse={pulse.warrantyTerms}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
