import React from 'react';
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
  createMaterial
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={draft?.id ? 'Edit Product' : 'Add Product'}
      className="max-w-4xl"
    >
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
        extraFields={() => (
          <div className="space-y-4">
            {/* Stock change reason if stock changed */}
            {stockChanged && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stock Change Reason
                </label>
                <textarea
                  value={stockReason}
                  onChange={(e) => onStockReasonChange(e.target.value)}
                  placeholder="Explain why stock is being changed..."
                  className="w-full rounded border px-3 py-2"
                  rows={3}
                />
              </div>
            )}

            {/* Additional POS-specific fields can be added here */}
            <div className="text-sm text-gray-500">
              Additional product configuration options available in POS interface.
            </div>
          </div>
        )}
      />
    </Modal>
  );
}