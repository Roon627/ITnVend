import React, { useState } from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';

export default function ImageCarousel({ images = [], alt = 'Image preview' }) {
  const [index, setIndex] = useState(0);
  if (!images || images.length === 0) return null;

  const prev = () => setIndex((i) => (i - 1 + images.length) % images.length);
  const next = () => setIndex((i) => (i + 1) % images.length);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex items-center justify-center bg-white p-2">
        <button onClick={prev} aria-label="Previous image" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/70 p-2 shadow">
          <FaChevronLeft />
        </button>
        <img
          src={images[index]}
          alt={`${alt} ${index + 1}`}
          className="max-w-full h-auto object-contain max-h-[32vh] sm:max-h-[40vh] md:max-h-[56vh]"
        />
        <button onClick={next} aria-label="Next image" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/70 p-2 shadow">
          <FaChevronRight />
        </button>
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((src, i) => (
            <button
              key={src + i}
              onClick={() => setIndex(i)}
              className={`h-12 w-12 sm:h-16 sm:w-16 flex-shrink-0 overflow-hidden rounded-md border ${
                i === index ? 'ring-2 ring-rose-400' : 'border-slate-200'
              }`}
            >
              <img src={src} alt={`thumb-${i}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
