/**
 * Three.js scene manager for LUT visualization.
 * Manages the render loop, camera, lighting, and top-level scene objects.
 */

import * as THREE from 'three';
import type { Lut3D } from '../core/lut/types';
import type { ViewportState } from '../store/index';
import { LutGeometry } from './LutGeometry';

export class LutScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  private animationId = 0;
  private identityGeo: LutGeometry | null = null;
  private transformedGeo: LutGeometry | null = null;
  private axesHelper: THREE.AxesHelper | null = null;
  private axisLabels: THREE.Object3D[] = [];
  private isDisposed = false;

  // Orbit state (manual implementation to avoid OrbitControls import issues)
  private orbitState = {
    isPointerDown: false,
    lastX: 0, lastY: 0,
    rotX: 0.4, rotY: -0.6,
    zoom: 2.6,   // enough to show full cube diagonal at any angle
    panX: 0, panY: 0,
  };

  // Orbit inversion flags
  private invertVertical = true;
  private invertHorizontal = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0d0d0f, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    this.updateCameraFromOrbit();

    this.addAxes();
    this.setupPointerEvents(canvas);
    this.startRenderLoop();
  }

  private addAxes(): void {
    this.axesHelper = new THREE.AxesHelper(0.55);
    // x=R, y=G, z=B — AxesHelper already colors them correctly
    this.scene.add(this.axesHelper);

    // Axis labels as small sprites
    const makeLabel = (text: string, color: string, pos: [number, number, number]) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'transparent';
      ctx.clearRect(0, 0, 64, 64);
      ctx.fillStyle = color;
      ctx.font = 'bold 40px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 32, 32);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(...pos);
      sprite.scale.set(0.12, 0.12, 1);
      return sprite;
    };

    const labels = [
      makeLabel('R', '#ff4444', [0.65, 0, 0]),
      makeLabel('G', '#44ff44', [0, 0.65, 0]),
      makeLabel('B', '#4444ff', [0, 0, 0.65]),
    ];
    labels.forEach((l) => {
      this.scene.add(l);
      this.axisLabels.push(l);
    });

    // Reference cube wireframe
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const boxMat = new THREE.LineBasicMaterial({ color: 0x333344, transparent: true, opacity: 0.5 });
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), boxMat);
    box.position.set(0.5, 0.5, 0.5);
    this.scene.add(box);
  }

  /** Update or replace the LUT geometry objects */
  updateLuts(
    identityLut: Lut3D | null,
    transformedLut: Lut3D | null,
    state: ViewportState
  ): void {
    // Remove old geometry
    if (this.identityGeo) {
      this.scene.remove(this.identityGeo.object);
      this.identityGeo.dispose();
      this.identityGeo = null;
    }
    if (this.transformedGeo) {
      this.scene.remove(this.transformedGeo.object);
      this.transformedGeo.dispose();
      this.transformedGeo = null;
    }

    if (state.showIdentity && identityLut) {
      this.identityGeo = new LutGeometry(identityLut, true, state);
      this.scene.add(this.identityGeo.object);
    }

    if (state.showTransformed && transformedLut) {
      this.transformedGeo = new LutGeometry(transformedLut, false, state);
      this.scene.add(this.transformedGeo.object);
    }
  }

  /** Update only material properties (point size, opacity, color mode) without rebuilding geometry */
  updateMaterials(state: ViewportState): void {
    this.identityGeo?.updateMaterials(state);
    this.transformedGeo?.updateMaterials(state);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setOrbitInversion(invertVertical: boolean, invertHorizontal: boolean): void {
    this.invertVertical = invertVertical;
    this.invertHorizontal = invertHorizontal;
  }

  resetCamera(): void {
    this.orbitState.rotX = 0.4;
    this.orbitState.rotY = -0.6;
    this.orbitState.zoom = 2.6;
    this.orbitState.panX = 0;
    this.orbitState.panY = 0;
    this.updateCameraFromOrbit();
  }

  screenshot(): string {
    // Force a render before capture
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  private updateCameraFromOrbit(): void {
    const { rotX, rotY, zoom, panX, panY } = this.orbitState;
    const x = zoom * Math.cos(rotX) * Math.sin(rotY);
    const y = zoom * Math.sin(rotX);
    const z = zoom * Math.cos(rotX) * Math.cos(rotY);
    this.camera.position.set(x + 0.5 + panX, y + 0.5 + panY, z + 0.5);
    this.camera.lookAt(0.5 + panX, 0.5 + panY, 0.5);
  }

  private setupPointerEvents(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      this.orbitState.isPointerDown = true;
      this.orbitState.lastX = e.clientX;
      this.orbitState.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!this.orbitState.isPointerDown) return;
      const dx = e.clientX - this.orbitState.lastX;
      const dy = e.clientY - this.orbitState.lastY;
      this.orbitState.lastX = e.clientX;
      this.orbitState.lastY = e.clientY;

      if (e.shiftKey) {
        // Pan
        const panScale = 0.002 * this.orbitState.zoom;
        this.orbitState.panX -= dx * panScale;
        this.orbitState.panY += dy * panScale;
      } else {
        // Orbit — apply inversion flags
        const hSign = this.invertHorizontal ? 1 : -1;
        const vSign = this.invertVertical  ? 1 : -1;
        this.orbitState.rotY += hSign * dx * 0.01;
        this.orbitState.rotX += vSign * dy * 0.01;
        this.orbitState.rotX = Math.max(-1.5, Math.min(1.5, this.orbitState.rotX));
      }
      this.updateCameraFromOrbit();
    });

    canvas.addEventListener('pointerup', () => {
      this.orbitState.isPointerDown = false;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.orbitState.zoom = Math.max(0.3, Math.min(8, this.orbitState.zoom + e.deltaY * 0.005));
      this.updateCameraFromOrbit();
    }, { passive: false });
  }

  private startRenderLoop(): void {
    const tick = () => {
      if (this.isDisposed) return;
      this.animationId = requestAnimationFrame(tick);
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  dispose(): void {
    this.isDisposed = true;
    cancelAnimationFrame(this.animationId);
    this.identityGeo?.dispose();
    this.transformedGeo?.dispose();
    this.renderer.dispose();
  }
}
