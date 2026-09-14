import React, { useEffect, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';

interface ImageZoomModalProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

type Point = { x: number; y: number };

export const ImageZoomModal: React.FC<ImageZoomModalProps> = ({ src, alt = 'Expanded image', onClose }) => {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const lastPointer = useRef<Point | null>(null);
  const pinchStartDistance = useRef<number | null>(null);
  const pinchStartScale = useRef(1);

  const clampPan = (next: Point, nextScale: number): Point => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect || nextScale <= 1) return { x: 0, y: 0 };
    const maxX = Math.max(0, (rect.width * (nextScale - 1)) / 2);
    const maxY = Math.max(0, (rect.height * (nextScale - 1)) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  };

  const setZoom = (next: number) => {
    const safe = Math.max(1, Math.min(4, next));
    setScale(safe);
    setPan(current => clampPan(current, safe));
    if (safe === 1) setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
    pointers.current.clear();
    pinchStartDistance.current = null;
  }, [src]);

  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinchStartDistance.current = distance(a, b);
      pinchStartScale.current = scale;
      setDragging(false);
      return;
    }

    if (scale > 1) {
      lastPointer.current = { x: event.clientX, y: event.clientY };
      setDragging(true);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      const start = pinchStartDistance.current;
      if (start) {
        const nextScale = pinchStartScale.current * (distance(a, b) / start);
        const safe = Math.max(1, Math.min(4, nextScale));
        setScale(safe);
        setPan(current => clampPan(current, safe));
      }
      return;
    }

    if (scale > 1 && lastPointer.current) {
      const dx = event.clientX - lastPointer.current.x;
      const dy = event.clientY - lastPointer.current.y;
      lastPointer.current = { x: event.clientX, y: event.clientY };
      setPan(current => clampPan({ x: current.x + dx, y: current.y + dy }, scale));
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchStartDistance.current = null;
    if (pointers.current.size === 0) {
      lastPointer.current = null;
      setDragging(false);
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setZoom(scale + (event.deltaY < 0 ? 0.25 : -0.25));
  };

  const reset = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/95 flex flex-col items-center justify-center p-3 sm:p-5" onClick={onClose}>
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-3">
        <div className="rounded-xl bg-black/60 border border-white/10 px-3 py-2 text-xs font-semibold text-white backdrop-blur-sm">
          Zoom {Math.round(scale * 100)}%
        </div>
        <div className="flex items-center gap-1.5 rounded-xl bg-black/60 border border-white/10 p-1 backdrop-blur-sm" onClick={e => e.stopPropagation()}>
          <button type="button" onClick={() => setZoom(scale - 0.25)} className="p-2 rounded-lg text-white hover:bg-white/10" title="Zoom out"><Minus className="w-4 h-4" /></button>
          <button type="button" onClick={reset} className="p-2 rounded-lg text-white hover:bg-white/10" title="Reset zoom"><RotateCcw className="w-4 h-4" /></button>
          <button type="button" onClick={() => setZoom(scale + 0.25)} className="p-2 rounded-lg text-white hover:bg-white/10" title="Zoom in"><Plus className="w-4 h-4" /></button>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-white hover:bg-rose-500/30" title="Close"><X className="w-4 h-4" /></button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`relative w-full h-[82vh] overflow-hidden flex items-center justify-center rounded-2xl touch-none ${scale > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'}`}
        onClick={e => e.stopPropagation()}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          draggable={false}
          onDoubleClick={() => setZoom(scale > 1 ? 1 : 2)}
          className="max-w-full max-h-full object-contain select-none will-change-transform transition-transform duration-100"
          style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})` }}
        />
      </div>

      <div className="absolute bottom-3 left-3 right-3 text-center text-[11px] text-slate-300 pointer-events-none">
        Pinch or use +/− to zoom • Drag when zoomed • Double-tap/double-click to toggle • Scroll wheel on desktop
      </div>
    </div>
  );
};
