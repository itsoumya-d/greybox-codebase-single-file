/**
 * Vitest setup file. Provides a minimal OffscreenCanvas / HTMLCanvasElement
 * polyfill so Babylon.GUI's DynamicTexture can construct under Node.
 *
 * We don't need pixel-perfect rendering — just enough surface for Babylon
 * to allocate its 2D context without crashing.
 */

class StubCanvasContext {
  canvas: { width: number; height: number };
  constructor(canvas: { width: number; height: number }) {
    this.canvas = canvas;
  }
  // Babylon calls these on the 2D context; no-op them.
  clearRect(): void { /* noop */ }
  fillRect(): void { /* noop */ }
  drawImage(): void { /* noop */ }
  getImageData(): { data: Uint8ClampedArray; width: number; height: number } {
    return {
      data: new Uint8ClampedArray(this.canvas.width * this.canvas.height * 4),
      width: this.canvas.width,
      height: this.canvas.height,
    };
  }
  putImageData(): void { /* noop */ }
  save(): void { /* noop */ }
  restore(): void { /* noop */ }
  translate(): void { /* noop */ }
  rotate(): void { /* noop */ }
  scale(): void { /* noop */ }
  transform(): void { /* noop */ }
  setTransform(): void { /* noop */ }
  beginPath(): void { /* noop */ }
  closePath(): void { /* noop */ }
  fill(): void { /* noop */ }
  stroke(): void { /* noop */ }
  moveTo(): void { /* noop */ }
  lineTo(): void { /* noop */ }
  arc(): void { /* noop */ }
  rect(): void { /* noop */ }
  measureText(): { width: number } { return { width: 0 }; }
  fillText(): void { /* noop */ }
  strokeText(): void { /* noop */ }
  createLinearGradient(): unknown { return { addColorStop: () => undefined }; }
  createRadialGradient(): unknown { return { addColorStop: () => undefined }; }
  createPattern(): unknown { return {}; }
  clip(): void { /* noop */ }
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  font = '';
  textAlign = '';
  textBaseline = '';
  globalAlpha = 1;
  globalCompositeOperation = '';
  shadowBlur = 0;
  shadowColor = '';
  shadowOffsetX = 0;
  shadowOffsetY = 0;
}

class StubOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext(): StubCanvasContext {
    return new StubCanvasContext(this);
  }
  // Babylon may call these; provide no-op promises.
  convertToBlob(): Promise<Blob> {
    return Promise.resolve(new Blob([]));
  }
  transferToImageBitmap(): unknown {
    return { width: this.width, height: this.height, close(): void { /* noop */ } };
  }
}

const globalAny = globalThis as unknown as {
  OffscreenCanvas?: typeof StubOffscreenCanvas;
  HTMLCanvasElement?: unknown;
  document?: unknown;
};

if (typeof globalAny.OffscreenCanvas === 'undefined') {
  globalAny.OffscreenCanvas = StubOffscreenCanvas;
}

// Stub `document.createElement('canvas')` so Babylon's `_CreateCanvas`
// fallback also succeeds.
if (typeof globalAny.document === 'undefined') {
  globalAny.document = {
    createElement(tag: string): unknown {
      if (tag === 'canvas') {
        return new StubOffscreenCanvas(256, 256);
      }
      return {};
    },
  };
}
