import React from 'react';
import AvailabilityTag from './AvailabilityTag';
import TagChips from './TagChips';
import { resolveMediaUrl } from '../lib/media';

export default function ProductInsight({ product = {}, formatCurrency = (v) => v, onTagClick, onEdit, onDelete, canDelete = false }) {
  const image = resolveMediaUrl(product.imageUrl || product.image);
  return (
    <div className="p-4 border rounded bg-white">
      <div className="flex gap-4">
        <div className="w-24 h-24 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
          {image ? <img src={image} alt={product.name || 'product'} className="w-full h-full object-cover" /> : <div className="text-xs text-gray-500">No image</div>}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{product.name}</h3>
            <div className="text-sm text-slate-700">{typeof product.price !== 'undefined' ? formatCurrency(product.price) : ''}</div>
          </div>
          <p className="text-xs text-slate-500 mt-1">{product.shortDescription}</p>
          <div className="mt-2">
            <AvailabilityTag status={product.availabilityStatus || product.availability} />
          </div>
          <div className="mt-2">
            <TagChips tags={product.tags || []} onClick={onTagClick} />
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className="px-2 py-1 text-xs border rounded" onClick={onEdit}>Edit</button>
            {canDelete && <button type="button" className="px-2 py-1 text-xs border rounded text-rose-600" onClick={onDelete}>Delete</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
