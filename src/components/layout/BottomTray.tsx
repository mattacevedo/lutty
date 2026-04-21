/**
 * Bottom tray — image preview with WebGL LUT application.
 * Supports a filmstrip of multiple images; the active slot drives the canvas.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useAppStore, selectActiveLut } from '../../store/index';
import { ImagePreviewGL } from '../../preview/ImagePreviewGL';
import type { Lut3D } from '../../core/lut/types';
import type { PreviewMode } from '../../store/index';
import { HelpTip } from '../ui/HelpTip';

interface BottomTrayProps {
  height: number;
}

export const BottomTray: React.FC<BottomTrayProps> = ({ height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<ImagePreviewGL | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Decoded images keyed by slot id — avoids re-decoding on slot switch
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const preview = useAppStore((s) => s.preview);
  const setPreview = useAppStore((s) => s.setPreview);
  const addPreviewImage = useAppStore((s) => s.addPreviewImage);
  const removePreviewImage = useAppStore((s) => s.removePreviewImage);
  const setActivePreviewImage = useAppStore((s) => s.setActivePreviewImage);
  const reorderPreviewImages = useAppStore((s) => s.reorderPreviewImages);
  const activeLutEntry = useAppStore(selectActiveLut);

  const [glError, setGlError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const filmDragFromRef = useRef<number | null>(null);
  const [filmDragOverIdx, setFilmDragOverIdx] = useState<number | null>(null);

  // Initialize WebGL preview
  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      previewRef.current = new ImagePreviewGL(canvasRef.current);
    } catch (e) {
      setGlError(e instanceof Error ? e.message : 'WebGL2 unavailable');
    }
    return () => {
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, []);

  const renderPreview = useCallback(() => {
    previewRef.current?.render(
      preview.mode,
      preview.wipePosition,
      preview.lutStrength,
      preview.showFalseColor,
    );
  }, [preview]);

  // Upload LUT to GPU when active LUT changes
  useEffect(() => {
    const lut = activeLutEntry?.lut;
    if (!lut || !previewRef.current) return;
    const lut3D = lut.type === '3D' ? (lut as Lut3D) : null;
    if (!lut3D) return;
    previewRef.current.setLut(lut3D);
    renderPreview();
  }, [activeLutEntry]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push active image to GPU when active slot changes
  useEffect(() => {
    const { activeImageId } = preview;
    if (!activeImageId || !previewRef.current) return;
    const img = imageCacheRef.current.get(activeImageId);
    if (img) {
      previewRef.current.setImage(img);
      renderPreview();
    }
  }, [preview.activeImageId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    renderPreview();
  }, [renderPreview]);

  const loadImageFile = useCallback((file: File) => {
    if (!previewRef.current) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const id = crypto.randomUUID();
      imageCacheRef.current.set(id, img);
      // Upload immediately so first render is instant
      previewRef.current?.setImage(img);
      addPreviewImage({ id, filename: file.name });
      renderPreview();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [addPreviewImage, renderPreview]);

  const handleRemoveImage = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    imageCacheRef.current.delete(id);
    removePreviewImage(id);
  }, [removePreviewImage]);

  const handleImageLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadImageFile(file);
    e.target.value = '';
  }, [loadImageFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (file) loadImageFile(file);
  }, [loadImageFile]);

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const onDragLeave = useCallback(() => setIsDragging(false), []);

  // Resize canvas
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      previewRef.current?.resize(canvas.width, canvas.height);
      renderPreview();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [renderPreview]);

  const MODES: { value: PreviewMode; label: string }[] = [
    { value: 'sideBySide', label: 'Side by Side' },
    { value: 'wipe', label: 'Wipe' },
    { value: 'difference', label: 'Difference' },
  ];

  const { images, activeImageId } = preview;

  return (
    <div className="bottom-tray" style={{ height }}>
      <div className="tray-header">
        <span className="tray-title">
          Image Preview
          <HelpTip text="Load photos or still frames to see how the active LUT affects different images. Add multiple images using the filmstrip — click a slot to switch." />
        </span>
        <div className="tray-controls">
          <button className="btn-sm" onClick={() => fileInputRef.current?.click()}>
            Load Image
          </button>
          {MODES.map((m) => (
            <button
              key={m.value}
              className={`btn-sm ${preview.mode === m.value ? 'active' : ''}`}
              onClick={() => setPreview({ mode: m.value })}
              title={
                m.value === 'sideBySide' ? 'Show original and LUT-applied versions side by side' :
                m.value === 'wipe'       ? 'Drag a split line across the image to reveal original vs LUT' :
                                           'Show the colour difference between original and LUT-applied images'
              }
            >
              {m.label}
            </button>
          ))}
          {preview.mode === 'wipe' && (
            <label className="ctrl-row compact">
              <span>Wipe<HelpTip text="Position of the vertical split line." /></span>
              <input
                type="range" min={0} max={1} step={0.01}
                value={preview.wipePosition}
                onChange={(e) => setPreview({ wipePosition: parseFloat(e.target.value) })}
                className="ctrl-slider short"
              />
            </label>
          )}
          <label className="ctrl-row compact">
            <span>Strength<HelpTip text="Blend between the original image (0) and the fully LUT-applied image (1)." /></span>
            <input
              type="range" min={0} max={1} step={0.01}
              value={preview.lutStrength}
              onChange={(e) => setPreview({ lutStrength: parseFloat(e.target.value) })}
              className="ctrl-slider short"
            />
          </label>
          {preview.mode === 'difference' && (
            <button
              className={`btn-sm ${preview.showFalseColor ? 'active' : ''}`}
              onClick={() => setPreview({ showFalseColor: !preview.showFalseColor })}
              title="Amplify small differences using a false-color map"
            >
              False Color
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageLoad}
        />
      </div>

      {images.length > 0 && (
        <div className="tray-filmstrip">
          {images.map((img, idx) => (
            <button
              key={img.id}
              className={`filmstrip-slot ${img.id === activeImageId ? 'active' : ''} ${filmDragOverIdx === idx ? 'drag-over' : ''}`}
              onClick={() => setActivePreviewImage(img.id)}
              title={img.filename}
              draggable
              onDragStart={(e) => {
                filmDragFromRef.current = idx;
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setFilmDragOverIdx(idx);
              }}
              onDragLeave={() => setFilmDragOverIdx(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (filmDragFromRef.current !== null && filmDragFromRef.current !== idx) {
                  reorderPreviewImages(filmDragFromRef.current, idx);
                }
                filmDragFromRef.current = null;
                setFilmDragOverIdx(null);
              }}
              onDragEnd={() => { filmDragFromRef.current = null; setFilmDragOverIdx(null); }}
            >
              <span className="filmstrip-name">{img.filename}</span>
              <span
                className="filmstrip-remove"
                role="button"
                onClick={(e) => handleRemoveImage(img.id, e)}
                title="Remove"
              >×</span>
            </button>
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        className={`tray-canvas-container ${isDragging ? 'drag-over' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        {glError ? (
          <div className="panel-empty">{glError}</div>
        ) : !activeImageId ? (
          <div className="panel-empty tray-drop-hint">
            <span>Drop an image here or click <strong>Load Image</strong></span>
          </div>
        ) : isDragging ? (
          <div className="tray-drop-overlay">Drop to add image</div>
        ) : null}
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>
    </div>
  );
};
