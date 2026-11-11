// Texte en texture (nom de salle au-dessus d'une porte).
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

export function useLabelTexture(text, { width = 512, height = 128 } = {}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#1f1a16';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#f2efe9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 64;
    do {
      ctx.font = `600 ${size}px system-ui, sans-serif`;
      size -= 4;
    } while (ctx.measureText(text).width > width - 40 && size > 20);
    ctx.fillText(text, width / 2, height / 2);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [text, width, height]);
  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}
