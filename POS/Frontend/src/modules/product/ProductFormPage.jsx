import React, { useState } from 'react';

export default function ProductFormPage() {
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded shadow">
      <h1 className="text-xl font-semibold mb-4">Add / Edit Product (scaffold)</h1>

      <form onSubmit={(e) => { e.preventDefault(); alert('Submit handler: implement API upload with multipart FormData'); }}>
        <label className="block text-sm font-medium text-gray-700">Product title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border rounded px-3 py-2 mt-1 mb-3" />

        <label className="block text-sm font-medium text-gray-700">Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full border rounded px-3 py-2 mt-1 mb-3">
          <option value="">Select a category</option>
          <option value="clothing">Clothing</option>
          <option value="electronics">Electronics</option>
          <option value="digital">Digital</option>
        </select>

        {category === 'clothing' && (
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700">Sizes (comma separated)</label>
            <input className="w-full border rounded px-3 py-2 mt-1" placeholder="S,M,L,XL" />
            <label className="block text-sm font-medium text-gray-700 mt-2">Colors (comma separated)</label>
            <input className="w-full border rounded px-3 py-2 mt-1" placeholder="Red,Blue" />
          </div>
        )}

        {category === 'electronics' && (
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700">Brand</label>
            <input className="w-full border rounded px-3 py-2 mt-1" />
            <label className="block text-sm font-medium text-gray-700 mt-2">Model</label>
            <input className="w-full border rounded px-3 py-2 mt-1" />
            <label className="block text-sm font-medium text-gray-700 mt-2">Warranty term</label>
            <input className="w-full border rounded px-3 py-2 mt-1" />
          </div>
        )}

        {category === 'digital' && (
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700">License key (optional)</label>
            <input className="w-full border rounded px-3 py-2 mt-1" />
            <label className="block text-sm font-medium text-gray-700 mt-2">Download URL</label>
            <input className="w-full border rounded px-3 py-2 mt-1" />
          </div>
        )}

        <label className="block text-sm font-medium text-gray-700">Price</label>
        <input value={price} onChange={(e) => setPrice(e.target.value)} className="w-full border rounded px-3 py-2 mt-1 mb-4" />

        <label className="block text-sm font-medium text-gray-700">Images</label>
        <input type="file" multiple className="w-full mt-1 mb-4" />

        <div className="flex gap-2">
          <button className="btn btn-primary">Save</button>
          <button type="button" className="btn btn-outline">Save & Continue</button>
        </div>
      </form>
    </div>
  );
}
