import React, { useEffect, useState } from "react";
import api from "../lib/api";

export default function CategoryManager() {
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const cats = await api.get("/categories");
      setCategories(cats);
    } catch (e) {
      setError(e.message || "Failed to load categories");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editing) {
        await api.put(`/categories/${editing.id}`, {
          name,
          parent_id: parentId || null,
        });
      } else {
        await api.post("/categories", { name, parent_id: parentId || null });
      }
      setName("");
      setParentId("");
      setEditing(null);
      fetchCategories();
    } catch (e) {
      setError(e.message || "Failed to save");
    }
    setLoading(false);
  };

  const handleEdit = (cat, parent) => {
    setEditing(cat);
    setName(cat.name);
    setParentId(parent ? parent.id : "");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this category?")) return;
    setLoading(true);
    try {
      await api.del(`/categories/${id}`);
      fetchCategories();
    } catch (e) {
      setError(e.message || "Failed to delete");
    }
    setLoading(false);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold mb-4">Manage Categories</h2>
      <form
        onSubmit={handleSave}
        className="mb-6 flex gap-2 flex-wrap items-end"
      >
        <div>
          <label className="block text-sm font-medium">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded px-2 py-1"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Parent Category</label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="border rounded px-2 py-1"
          >
            <option value="">None (Top-level)</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          {editing ? "Update" : "Add"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setName("");
              setParentId("");
            }}
            className="ml-2 px-3 py-2 rounded bg-gray-200"
          >
            Cancel
          </button>
        )}
      </form>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {loading && <div>Loading...</div>}
      <ul className="space-y-2">
        {categories.map((cat) => (
          <li key={cat.id} className="border rounded p-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{cat.name}</span>
              <span>
                <button
                  onClick={() => handleEdit(cat, null)}
                  className="text-blue-600 mr-2"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(cat.id)}
                  className="text-red-600"
                >
                  Delete
                </button>
              </span>
            </div>
            {cat.subcategories && cat.subcategories.length > 0 && (
              <ul className="ml-6 mt-1 space-y-1">
                {cat.subcategories.map((sub) => (
                  <li
                    key={sub.id}
                    className="flex items-center justify-between"
                  >
                    <span>{sub.name}</span>
                    <span>
                      <button
                        onClick={() => handleEdit(sub, cat)}
                        className="text-blue-600 mr-2"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(sub.id)}
                        className="text-red-600"
                      >
                        Delete
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
