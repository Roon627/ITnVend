import React from 'react';
import { Link } from 'react-router-dom';
import { FaSlidersH, FaTimes } from 'react-icons/fa';
import Modal from './Modal';
import ProductForm from './ProductForm';

export default function ProductModal({
  open,
  draft,
  onClose,
  onChange,
  onSave,
  onUploadImage,
  onUploadGallery,
  onRemoveGalleryItem,
  onMoveGalleryItem,
  galleryUploading,
  uploading,
  saving,
  stockChanged,
  stockReason,
  onStockReasonChange,
  categoryTree,
  lookups,
  vendors,
  onTagsChanged,
  createBrand,
  createMaterial,
  createColor,
  createAudience,
  createDeliveryType,
  createWarrantyTerm,
}) {
  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="product-editor-title"
      align="start"
      className="w-full max-w-5xl"
    >
      <div className="flex h-full max-h-[90vh] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-300">
              Product tools
            </p>
            <h2 id="product-editor-title" className="text-2xl font-extrabold text-slate-900">
              {draft?.id ? 'Edit product' : 'Add product'}
            </h2>
            <p className="text-sm text-slate-500">
              Changes sync instantly across POS, vendor dashboards, and the public store.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/manage-lookups"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:border-rose-200 hover:text-rose-600"
              target="_blank"
              rel="noreferrer"
            >
              <FaSlidersH aria-hidden className="text-rose-400" />
              Manage lookups
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:text-rose-600"
              aria-label="Close product editor"
            >
              <FaTimes />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <ProductForm
            initial={draft}
            onSave={onSave}
            onCancel={onClose}
            onChange={onChange}
            onUploadImage={onUploadImage}
            onUploadGallery={onUploadGallery}
            onRemoveGalleryItem={onRemoveGalleryItem}
            onMoveGalleryItem={onMoveGalleryItem}
            galleryUploading={galleryUploading}
            uploading={uploading}
            saving={saving}
            stockChanged={stockChanged}
            stockReason={stockReason}
            onStockReasonChange={onStockReasonChange}
            categoryTree={categoryTree}
            lookups={lookups}
            vendors={vendors}
            onTagsChanged={onTagsChanged}
            createBrand={createBrand}
            createMaterial={createMaterial}
            createColor={createColor}
            createAudience={createAudience}
            createDeliveryType={createDeliveryType}
            createWarrantyTerm={createWarrantyTerm}
            extraFields={() => (
              <div className="space-y-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
                {stockChanged && (
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Stock change reason
                    </label>
                    <textarea
                      value={stockReason}
                      onChange={(e) => onStockReasonChange(e.target.value)}
                      placeholder="Explain why stock is being changed..."
                      className="mt-1 w-full rounded-lg border border-white bg-white px-3 py-2 text-sm text-slate-700 shadow focus:border-rose-200 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      rows={3}
                    />
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  Need more configuration? Visit the Manage Lookups screen to adjust categories,
                  brands, materials, and other shared settings.
                </p>
              </div>
            )}
          />
        </div>
      </div>
    </Modal>
  );
}
