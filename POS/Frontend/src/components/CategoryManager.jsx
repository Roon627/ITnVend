import React, { useState } from 'react';
import { FaChevronDown, FaChevronRight, FaPlus, FaPencilAlt, FaTrash, FaCheck, FaTimes, FaFolderOpen, FaFolder } from 'react-icons/fa';
import { api } from '../lib/api';

const CategoryItem = ({ category, level = 0, onUpdate, onDelete, onAddChild }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(category.name);
  const [isExpanded, setIsExpanded] = useState(level < 1);
  const [isAddingChild, setIsAddingChild] = useState(false);
  const [newChildName, setNewChildName] = useState('');

  const handleUpdate = async () => {
    if (draftName.trim() && draftName.trim() !== category.name) {
      await onUpdate(category.id, draftName.trim());
    }
    setIsEditing(false);
  };

  const handleAddChild = async () => {
    if (newChildName.trim()) {
      await onAddChild(category.id, newChildName.trim());
    }
    setIsAddingChild(false);
    setNewChildName('');
  };

  const hasChildren = category.children?.length > 0;

  return (
    <div>
      <div
        style={{ marginLeft: `${level * 24}px` }}
        className="flex items-center gap-2 py-2 px-3 rounded-lg group transition-colors"
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-surface-muted)'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        {/* Expand/Collapse Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          disabled={!hasChildren}
          className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 transition-colors ${
            !hasChildren ? 'opacity-0 cursor-default' : ''
          }`}
          style={{ color: !hasChildren ? 'transparent' : 'var(--color-muted)' }}
        >
          {hasChildren && (isExpanded ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />)}
  clear      </button>

        {/* Icon and Name */}
        {isEditing ? (
          <input
            autoFocus
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={handleUpdate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleUpdate();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            className="flex-1 px-2 py-1 rounded-md text-sm font-medium focus:outline-none"
            style={{
              backgroundColor: 'white',
              border: `2px solid var(--color-primary)`,
              color: 'var(--color-text)',
              boxShadow: `0 0 0 3px var(--color-primary-soft)`
            }}
          />
        ) : (
          <>
            <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center" style={{ color: 'var(--color-primary)' }}>
              {hasChildren ? (
                isExpanded ? (
                  <FaFolderOpen />
                ) : (
                  <FaFolder />
                )
              ) : (
                <FaFolder style={{ opacity: 0.4 }} />
              )}
            </span>
            <span className="flex-1 text-sm font-medium" style={{ color: 'var(--color-text)' }}>{category.name}</span>
          </>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isEditing && (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 rounded-md transition-colors"
                style={{ color: 'var(--color-primary)', backgroundColor: 'var(--color-primary-soft)' }}
                title="Edit"
              >
                <FaPencilAlt size={12} />
              </button>
              <button
                onClick={() => setIsAddingChild(true)}
                className="p-1.5 rounded-md transition-colors"
                style={{ color: 'var(--color-success)', backgroundColor: 'var(--color-success-soft)' }}
                title="Add subcategory"
              >
                <FaPlus size={12} />
              </button>
              <button
                onClick={() => onDelete(category.id)}
                className="p-1.5 rounded-md transition-colors"
                style={{ color: 'var(--color-error)', backgroundColor: 'var(--color-error-soft)' }}
                title="Delete"
              >
                <FaTrash size={12} />
              </button>
            </>
          )}
          {isEditing && (
            <>
              <button
                onClick={handleUpdate}
                className="p-1.5 rounded-md transition-colors"
                style={{ color: 'var(--color-success)', backgroundColor: 'var(--color-success-soft)' }}
                title="Save"
              >
                <FaCheck size={12} />
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="p-1.5 rounded-md transition-colors"
                style={{ backgroundColor: 'var(--color-surface-muted)', color: 'var(--color-muted)' }}
                title="Cancel"
              >
                <FaTimes size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Add Child Input */}
      {isAddingChild && (
        <div
          style={{ marginLeft: `${(level + 1) * 24}px`, backgroundColor: 'var(--color-success-soft)' }}
          className="flex items-center gap-2 py-2 px-3 rounded-lg"
        >
          <span className="flex-shrink-0 w-5 h-5"></span>
          <input
            autoFocus
            type="text"
            value={newChildName}
            onChange={(e) => setNewChildName(e.target.value)}
            onBlur={handleAddChild}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddChild();
              if (e.key === 'Escape') setIsAddingChild(false);
            }}
            placeholder="New subcategory..."
            className="flex-1 px-2 py-1 rounded-md bg-white text-sm focus:outline-none"
            style={{
              border: `1px solid var(--color-success)`,
              color: 'var(--color-text)'
            }}
          />
          <button
            onClick={handleAddChild}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--color-success)' }}
            title="Save"
          >
            <FaCheck size={12} />
          </button>
          <button
            onClick={() => setIsAddingChild(false)}
            className="p-1.5 rounded-md transition-colors"
            style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-muted)' }}
            title="Cancel"
          >
            <FaTimes size={12} />
          </button>
        </div>
      )}

      {/* Child Items */}
      {isExpanded && hasChildren && category.children?.map(child => (
        <CategoryItem
          key={child.id}
          category={child}
          level={level + 1}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAddChild={onAddChild}
        />
      ))}
    </div>
  );
};

export default function CategoryManager({ categories, onMutate }) {
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleUpdate = async (id, name) => {
    try {
      await api.put(`/categories/${id}`, { name });
      onMutate('update');
    } catch (err) {
      console.error('Failed to update category', err);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure? Deleting a category may affect products and subcategories.')) {
      try {
        await api.del(`/categories/${id}`);
        onMutate('delete');
      } catch (err) {
        console.error('Failed to delete category', err);
      }
    }
  };

  const handleAdd = async (parentId, name) => {
    try {
      await api.post('/categories', { name, parentId });
      onMutate('add');
    } catch (err) {
      console.error('Failed to add category', err);
    }
  };

  const handleAddRoot = async () => {
    if (newCategoryName.trim()) {
      await handleAdd(null, newCategoryName.trim());
      setNewCategoryName('');
    }
  };

  const isEmpty = categories.length === 0;

  return (
    <div className="rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow" style={{ backgroundColor: 'var(--color-surface)' }}>
      <div className="px-6 py-4 border-b" style={{ backgroundColor: 'var(--color-surface-muted)', borderColor: 'var(--color-border)' }}>
        <h2 className="text-lg font-bold flex items-center gap-3" style={{ color: 'var(--color-heading)' }}>
          <FaFolder style={{ color: 'var(--color-primary)' }} />
          Categories
          <span className="text-xs font-semibold px-2 py-1 rounded-full ml-auto" style={{ backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>
            {categories.length}
          </span>
        </h2>
      </div>

      <div className="px-6 py-4">
        {isEmpty ? (
          <div className="text-center py-8">
            <div className="mb-2" style={{ color: 'var(--color-muted)' }}>
              <FaFolder className="text-4xl mx-auto opacity-30 mb-2" />
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--color-muted)' }}>No categories yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-muted)', opacity: 0.7 }}>Add your first category below</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-1">
            {categories.map(category => (
              <CategoryItem
                key={category.id}
                category={category}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onAddChild={handleAdd}
              />
            ))}
          </div>
        )}

        <div className="mt-4 pt-4" style={{ borderTop: `1px solid var(--color-border)` }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddRoot()}
              placeholder="Add new root category..."
              className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none text-slate-700"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: `1px solid var(--color-border)`,
                color: 'var(--color-text)'
              }}
              onFocus={(e) => e.target.style.boxShadow = `0 0 0 3px var(--color-primary-soft)`}
              onBlur={(e) => e.target.style.boxShadow = 'none'}
            />
            <button
              onClick={handleAddRoot}
              disabled={!newCategoryName.trim()}
              className="px-4 py-2 text-white text-sm font-semibold rounded-lg flex items-center gap-2 transition-all"
              style={{
                backgroundColor: !newCategoryName.trim() ? 'var(--color-muted)' : 'var(--color-primary)',
                opacity: !newCategoryName.trim() ? 0.6 : 1
              }}
            >
              <FaPlus size={14} />
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
