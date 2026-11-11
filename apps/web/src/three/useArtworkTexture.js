// Texture d'un tableau : miniature, puis image complète.
import { useEffect, useState } from 'react';
import * as THREE from 'three';

const loader = new THREE.TextureLoader();

function load(url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

export function useArtworkTexture(thumbnailUrl, imageUrl) {
  const [state, setState] = useState({ texture: null, failed: false });

  useEffect(() => {
    let cancelled = false;
    const loaded = [];
    (async () => {
      let any = false;
      for (const url of [thumbnailUrl, imageUrl]) {
        try {
          const texture = await load(url);
          if (cancelled) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 4;
          loaded.push(texture);
          any = true;
          setState({ texture, failed: false });
        } catch {
          // Échec : texture précédente conservée.
        }
      }
      if (!any && !cancelled) setState({ texture: null, failed: true });
    })();
    return () => {
      cancelled = true;
      for (const texture of loaded) texture.dispose();
    };
  }, [thumbnailUrl, imageUrl]);

  return state;
}
