import React, { useState, useEffect } from 'react';
import { FaChevronLeft, FaChevronRight, FaTimes } from 'react-icons/fa';

export default function ImageCarousel({ images = [], alt = 'Image preview' }) {
  const imgs = images || [];
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const prev = () => setIndex((i) => (i - 1 + images.length) % images.length);
  const next = () => setIndex((i) => (i + 1) % images.length);

  useEffect(() => {
    if (!lightboxOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + imgs.length) % imgs.length);
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % imgs.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, imgs.length]);

  return (
    <div className="flex flex-col gap-3">
  <div className="relative grid place-items-center bg-white p-2 overflow-hidden min-w-0 h-auto max-h-[75dvh]">
        <button
          onClick={prev}
          aria-label="Previous image"
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/70 p-2 shadow z-30"
        >
          <FaChevronLeft />
        </button>

        <img
          src={imgs[index]}
          alt={`${alt} ${index + 1}`}
          className="object-contain w-auto max-w-full h-auto max-h-[70dvh] mx-auto transition-all duration-300 cursor-zoom-in"
          onClick={() => setLightboxOpen(true)}
        />

        <button
          onClick={next}
          aria-label="Next image"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/70 p-2 shadow z-30"
        >
          <FaChevronRight />
        </button>
      </div>

  {imgs.length > 1 && (
        // hide thumbnail strip on very small screens to avoid overlap/clutter
        <div className="hidden sm:flex gap-2 overflow-x-auto">
          {imgs.map((src, i) => (
            <button
              key={src + i}
              onClick={() => setIndex(i)}
              className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border ${
                i === index ? 'ring-2 ring-rose-400' : 'border-slate-200'
              }`}
            >
              <img src={src} alt={`thumb-${i}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {lightboxOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <button
            onClick={() => setLightboxOpen(false)}
            aria-label="Close"
            className="absolute right-6 top-6 rounded-full bg-white/20 p-2 text-white"
          >
            <FaTimes />
          </button>

          <button
            onClick={prev}
            aria-label="Previous"
            className="absolute left-6 top-1/2 -translate-y-1/2 rounded-full bg-white/20 p-3 text-white"
          >
            <FaChevronLeft />
          </button>

          <img src={imgs[index]} alt={`${alt} ${index + 1}`} className="max-h-[90vh] max-w-[90vw] object-contain" />

          <button
            onClick={next}
            aria-label="Next"
            className="absolute right-6 top-1/2 -translate-y-1/2 rounded-full bg-white/20 p-3 text-white"
          >
            <FaChevronRight />
          </button>
        </div>
      )}
    </div>
  );
}
