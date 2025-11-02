import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { FaTrademark, FaBoxOpen, FaPalette, FaTags, FaPlus, FaTrash, FaCheck, FaTimes, FaPencilAlt } from 'react-icons/fa';
import { useToast } from '../components/ToastContext';
import CategoryManager from '../components/CategoryManager';

const EditableList = ({ title, items, onUpdate, onDelete, onAdd, Icon }) => {
  const [drafts, setDrafts] = useState({});
  const [newItem, setNewItem] = useState('');
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    setDrafts({});
  }, [items]);

  const clearDraft = (id) => {
    setDrafts(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleUpdate = (id) => {
    const name = drafts[id]?.trim();
    if (name && name !== items.find(i => i.id === id)?.name) {
      onUpdate(id, name);
    }
    clearDraft(id);
    setEditingId(null);
  };

  const handleAdd = () => {
    if (newItem.trim()) {
      onAdd(newItem.trim());
      setNewItem('');
    }
  };

  const itemsSorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const isEmpty = items.length === 0;

  return (
    <div className="h-full flex flex-col rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden" style={{ backgroundColor: 'var(--color-surface)' }}>
      
      {/* Header */}
      <div className="px-4 sm:px-5 lg:px-6 py-3 sm:py-4 border-b flex-shrink-0" style={{ backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && <Icon className="text-lg sm:text-xl flex-shrink-0" style={{ color: 'var(--color-primary)' }} />}
            <h2 className="text-base sm:text-lg font-bold truncate" style={{ color: 'var(--color-heading)' }}>{title}</h2>
          </div>
          <span className="text-xs font-semibold px-2 sm:px-3 py-1 rounded-full whitespace-nowrap flex-shrink-0" style={{ backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>
            {items.length}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-4 sm:px-5 lg:px-6 py-4 overflow-hidden">
        
        {/* Items List */}
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
            <div className="mb-3" style={{ color: 'var(--color-muted)' }}>
              {Icon && <Icon className="text-5xl sm:text-6xl opacity-30" />}
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--color-muted)' }}>No {title.toLowerCase()} yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-muted)', opacity: 0.7 }}>Add your first {title.slice(0, -1).toLowerCase()} below</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-2">
            {itemsSorted.map(item => (
              <div
                key={item.id}
                className="group flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border transition-all duration-200 min-h-[40px]"
                style={{ backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-border)' }}
              >
                {editingId === item.id ? (
                  <>
                    <input
                      autoFocus
                      type="text"
                      value={drafts[item.id] ?? item.name}
                      onChange={(e) => setDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdate(item.id);
                        if (e.key === 'Escape') {
                          setEditingId(null);
                          clearDraft(item.id);
                        }
                      }}
                      className="flex-1 px-2 sm:px-3 py-2 rounded-md bg-white text-sm focus:outline-none text-slate-700"
                      style={{
                        border: `2px solid var(--color-primary)`,
                        boxShadow: `0 0 0 3px var(--color-primary-soft)`
                      }}
                    />
                    <button
                      onClick={() => handleUpdate(item.id)}
                      className="p-1.5 rounded-md transition-colors flex-shrink-0"
                      style={{ color: 'var(--color-success)', background: 'var(--color-success-soft)' }}
                      title="Save"
                    >
                      <FaCheck size={14} />
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        clearDraft(item.id);
                      }}
                      className="p-1.5 rounded-md transition-colors flex-shrink-0"
                      style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-muted)' }}
                      title="Cancel"
                    >
                      <FaTimes size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{item.name}</span>
                    <button
                      onClick={() => {
                        clearDraft(item.id);
                        setEditingId(item.id);
                      }}
                      className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all duration-200 flex-shrink-0"
                      style={{ color: 'var(--color-primary)', backgroundColor: 'var(--color-primary-soft)' }}
                      title="Edit"
                    >
                      <FaPencilAlt size={14} />
                    </button>
                    <button
                      onClick={() => onDelete(item.id)}
                      className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all duration-200 flex-shrink-0"
                      style={{ color: 'var(--color-error)', backgroundColor: 'var(--color-error-soft)' }}
                      title="Delete"
                    >
                      <FaTrash size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add New Item */}
        <div className="border-t pt-3 sm:pt-4 mt-auto" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder={`Add new...`}
              className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 text-slate-700"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: `1px solid var(--color-border)`,
                color: 'var(--color-text)'
              }}
              onFocus={(e) => e.target.style.boxShadow = `0 0 0 3px var(--color-primary-soft)`}
              onBlur={(e) => e.target.style.boxShadow = 'none'}
            />
            <button
              onClick={handleAdd}
              disabled={!newItem.trim()}
              className="px-3 sm:px-4 py-2 text-white text-sm font-semibold rounded-lg flex items-center gap-2 flex-shrink-0 transition-all duration-200"
              style={{
                backgroundColor: !newItem.trim() ? 'var(--color-muted)' : 'var(--color-primary)',
                opacity: !newItem.trim() ? 0.6 : 1
              }}
              title="Add"
            >
              <FaPlus size={12} className="hidden sm:inline" />
              <span className="hidden sm:inline">Add</span>
              <span className="sm:hidden">+</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function ManageLookups() {
  const [lookups, setLookups] = useState({ brands: [], materials: [], colors: [], tags: [] });
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const fetchLookups = useCallback(async () => {
    setLoading(true);
    try {
      const [lu, cats] = await Promise.all([
        api.get('/lookups'),
        api.get('/categories/tree?depth=10')
      ]);
      setLookups(lu || { brands: [], materials: [], colors: [], tags: [] });
      setCategories(cats || []);
    } catch (err) {
      toast.push('Failed to load lookup data', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  const handleGenericUpdate = async (type, id, name) => {
    try {
      await api.put(`/${type}/${id}`, { name });
      toast.push(`${type.slice(0, -1)} updated`, 'success');
      fetchLookups();
    } catch (err) {
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
      toast.push(`Failed to delete ${type.slice(0, -1)}`, 'error');
    }
  };

  const handleGenericAdd = async (type, name) => {
    try {
      await api.post(`/${type}`, { name });
      toast.push(`${type.slice(0, -1)} added`, 'success');
      fetchLookups();
    } catch (err) {
      toast.push(`Failed to add ${type.slice(0, -1)}`, 'error');
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="text-center">
          <div className="animate-spin inline-flex items-center justify-center w-12 h-12 rounded-full border-4 border-slate-200" style={{ borderTopColor: 'var(--color-primary)' }}></div>
          <p className="mt-4" style={{ color: 'var(--color-muted)' }}>Loading lookup data...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: 'var(--color-bg)' }} className="min-h-screen">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        
        {/* Header Section */}
        <div className="mb-8 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold mb-1" style={{ color: 'var(--color-heading)' }}>
            Manage Lookups
          </h1>
          <p className="text-sm sm:text-base" style={{ color: 'var(--color-muted)' }}>
            Organize your product attributes and maintain consistency across your inventory.
          </p>
        </div>

        {/* Categories Section - Full Width */}
        <div className="mb-8 sm:mb-10">
          <CategoryManager categories={categories} onMutate={fetchLookups} />
        </div>

        {/* Section Divider */}
        <div className="flex items-center gap-4 my-8 sm:my-10">
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }}></div>
          <span className="text-xs font-medium px-3" style={{ color: 'var(--color-muted)' }}>Quick Attributes</span>
          <div className="flex-1 h-px" style={{ backgroundColor: 'var(--color-border)' }}></div>
        </div>

        {/* Lookups Grid - Responsive */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6 auto-rows-fr">
          <EditableList
            Icon={FaTrademark}
            title="Brands"
            items={lookups.brands}
            onUpdate={(id, name) => handleGenericUpdate('brands', id, name)}
            onDelete={(id) => handleGenericDelete('brands', id)}
            onAdd={(name) => handleGenericAdd('brands', name)}
          />
          <EditableList
            Icon={FaBoxOpen}
            title="Materials"
            items={lookups.materials}
            onUpdate={(id, name) => handleGenericUpdate('materials', id, name)}
            onDelete={(id) => handleGenericDelete('materials', id)}
            onAdd={(name) => handleGenericAdd('materials', name)}
          />
          <EditableList
            Icon={FaPalette}
            title="Colors"
            items={lookups.colors}
            onUpdate={(id, name) => handleGenericUpdate('colors', id, name)}
            onDelete={(id) => handleGenericDelete('colors', id)}
            onAdd={(name) => handleGenericAdd('colors', name)}
          />
          <EditableList
            Icon={FaTags}
            title="Tags"
            items={lookups.tags}
            onUpdate={(id, name) => handleGenericUpdate('tags', id, name)}
            onDelete={(id) => handleGenericDelete('tags', id)}
            onAdd={(name) => handleGenericAdd('tags', name)}
          />
        </div>

        {/* Footer Spacing */}
        <div className="mt-8 sm:mt-10 lg:mt-12"></div>
      </div>
    </div>
  );
}
