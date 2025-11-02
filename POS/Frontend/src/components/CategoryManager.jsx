import React, { useState } from 'react';
import { FaChevronDown, FaChevronRight, FaPlus, FaEdit, FaTrash, FaSave, FaFolder, FaFolderOpen } from 'react-icons/fa';
import { api } from '../lib/api';

const CategoryItem = ({ category, level = 0, onUpdate, onDelete, onAddChild }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(category.name);
  const [isExpanded, setIsExpanded] = useState(level < 1); // Expand top levels by default
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

  return (
    <div style={{ marginLeft: `${level * 20}px` }}>
      <div className="flex items-center gap-2 py-1 group">
        <button onClick={() => setIsExpanded(!isExpanded)} className="text-slate-500 hover:text-slate-800" disabled={!category.children?.length}>
          {category.children?.length ? (isExpanded ? <FaChevronDown size="12" /> : <FaChevronRight size="12" />) : <span className="w-[12px]" />}
        </button>
        {isEditing ? (
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={handleUpdate}
            onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
            className="flex-1 rounded-md border-slate-300 shadow-sm px-2 py-1 text-sm"
            autoFocus
          />
        ) : (
          <div className="flex items-center gap-2">
            {category.children?.length ? (isExpanded ? <FaFolderOpen className="text-slate-400" /> : <FaFolder className="text-slate-400" />) : <FaFolder className="text-slate-300" />}
            <span className="text-slate-800">{category.name}</span>
          </div>
        )}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
          <button onClick={() => setIsEditing(true)} className="text-sky-600 hover:text-sky-800"><FaEdit size="14" /></button>
          <button onClick={() => onDelete(category.id)} className="text-red-600 hover:text-red-800"><FaTrash size="14" /></button>
          <button onClick={() => setIsAddingChild(true)} className="text-emerald-600 hover:text-emerald-800"><FaPlus size="14" /></button>
        </div>
      </div>
      {isAddingChild && (
        <div className="flex items-center gap-2 py-1" style={{ marginLeft: `${(level + 1) * 20}px` }}>
          <input
            type="text"
            value={newChildName}
            onChange={(e) => setNewChildName(e.target.value)}
            onBlur={handleAddChild}
            onKeyDown={(e) => e.key === 'Enter' && handleAddChild()}
            className="flex-1 rounded-md border-slate-300 shadow-sm px-2 py-1 text-sm"
            placeholder="New subcategory name"
            autoFocus
          />
          <button onClick={handleAddChild} className="text-emerald-600 hover:text-emerald-800"><FaSave size="14" /></button>
        </div>
      )}
      {isExpanded && category.children?.map(child => (
        <CategoryItem key={child.id} category={child} level={level + 1} onUpdate={onUpdate} onDelete={onDelete} onAddChild={onAddChild} />
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

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h2 className="text-xl font-semibold text-slate-700 mb-4">Categories</h2>
      <div className="space-y-1">
        {categories.map(category => (
          <CategoryItem key={category.id} category={category} onUpdate={handleUpdate} onDelete={handleDelete} onAddChild={handleAdd} />
        ))}
      </div>
      <div className="mt-4 flex gap-2 pt-4 border-t">
        <input
          type="text"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="New root category"
          className="flex-1 rounded-md border-slate-300 shadow-sm px-2 py-1 text-sm"
        />
        <button
          onClick={handleAddRoot}
          className="px-3 py-1 text-sm rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-emerald-300"
          disabled={!newCategoryName.trim()}
        >
          Add Root Category
        </button>
      </div>
    </div>
  );
}
