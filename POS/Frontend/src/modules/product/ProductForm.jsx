import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaTimes } from 'react-icons/fa';
import SharedProductForm from '../../components/ProductForm';

export default function ProductForm({ open, draft, onClose, onSave, saving, onChange, onUploadImage, onUploadGallery, onRemoveGalleryItem, onMoveGalleryItem, galleryUploading, uploading, categoryTree, lookups, vendors, onTagsChanged, createBrand, createMaterial, stockChanged }) {
  const modalRef = useRef(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      const id = setTimeout(() => setModalVisible(true), 10);
      return () => clearTimeout(id);
    }
    setModalVisible(false);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const root = modalRef.current;
    if (!root) return undefined;
    const focusable = Array.from(
      root.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
    if (focusable.length) focusable[0].focus();

    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || !draft) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-start justify-center p-6 ${modalVisible ? 'opacity-100' : 'opacity-0'} transition-opacity`} role="dialog" aria-modal="true">
      <div ref={modalRef} className={`bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col transform transition-all duration-300 ease-out ${modalVisible ? 'translate-y-0' : 'translate-y-6'}`} style={{outline: 'none'}} tabIndex={-1} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <header className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 id="product-modal-title" className="text-xl font-semibold text-slate-800">{draft.id ? 'Edit product' : 'Add product'}</h2>
            <p className="text-sm text-slate-500">Edit product details. Changes are saved to the POS backend.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/manage-lookups" target="_blank" className="text-sm text-blue-600 hover:text-blue-800">Manage lookups</Link>
            <button
              onClick={onClose}
              className="p-2 rounded-md hover:bg-slate-100 text-slate-500"
              aria-label="Close product editor"
            >
              <FaTimes />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <SharedProductForm
            initial={draft}
            onSave={onSave}
            onCancel={onClose}
            saving={saving}
            lookups={lookups}
            categoryTree={categoryTree}
            vendors={vendors}
            onChange={onChange}
            onUploadImage={onUploadImage}
            onUploadGallery={onUploadGallery}
            onRemoveGalleryItem={onRemoveGalleryItem}
            onMoveGalleryItem={onMoveGalleryItem}
            galleryUploading={galleryUploading}
            uploading={uploading}
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
                      value={draft.stockReason || ''}
                      onChange={(e) => onChange && onChange('stockReason', e.target.value, { ...(draft || {}), stockReason: e.target.value })}
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
        </div>

      </div>
    </div>
  );
}
