/**
 * Hook managing the Three.js LUT visualization scene lifecycle.
 */

import { useEffect, useRef, useCallback } from 'react';
import { LutScene } from '../visualization/LutScene';
import { makeIdentity3D } from '../core/lut/identity';
import { useAppStore, selectActiveLut } from '../store/index';
import type { Lut3D } from '../core/lut/types';

export function useThreeScene(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const sceneRef = useRef<LutScene | null>(null);
  const isMountedRef = useRef(false);
  const prevLutIdRef = useRef<string | null>(null);
  const viewport = useAppStore((s) => s.viewport);
  const activeLutEntry = useAppStore(selectActiveLut);

  // Initialize scene
  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new LutScene(canvasRef.current);
    sceneRef.current = scene;

    // Handle reset camera keyboard event
    const onReset = () => scene.resetCamera();
    window.addEventListener('lutty:resetCamera', onReset);

    return () => {
      window.removeEventListener('lutty:resetCamera', onReset);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset camera whenever active LUT switches so the full cube is always in view
  useEffect(() => {
    const newId = activeLutEntry?.id ?? null;
    if (newId !== prevLutIdRef.current) {
      prevLutIdRef.current = newId;
      if (newId !== null) sceneRef.current?.resetCamera();
    }
  }, [activeLutEntry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update geometry when LUT or display settings change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const activeLut = activeLutEntry?.lut ?? null;
    const lut3D = activeLut?.type === '3D' ? (activeLut as Lut3D) : null;
    const identity = lut3D ? makeIdentity3D(lut3D.size) : null;

    scene.updateLuts(identity, lut3D, viewport);
  }, [activeLutEntry, viewport.displayMode, viewport.colorMode, viewport.showIdentity, viewport.showTransformed, viewport.sliceAxis, viewport.slicePosition, viewport.densityFactor, viewport.showClippedHighlight]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update only material properties when the user changes them — skip on initial mount
  // because buildPoints already bakes pointSize into the geometry material.
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    sceneRef.current?.updateMaterials(viewport);
  }, [viewport.pointSize, viewport.opacity]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync orbit inversion flags
  useEffect(() => {
    sceneRef.current?.setOrbitInversion(viewport.invertVerticalOrbit, viewport.invertHorizontalOrbit);
  }, [viewport.invertVerticalOrbit, viewport.invertHorizontalOrbit]);

  // Handle canvas resize
  const handleResize = useCallback((width: number, height: number) => {
    sceneRef.current?.resize(width, height);
  }, []);

  const resetCamera = useCallback(() => {
    sceneRef.current?.resetCamera();
  }, []);

  const takeScreenshot = useCallback((): string | null => {
    return sceneRef.current?.screenshot() ?? null;
  }, []);

  return { handleResize, resetCamera, takeScreenshot };
}
