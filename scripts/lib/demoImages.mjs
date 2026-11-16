// Images de démonstration.
import sharp from 'sharp';

const PALETTES = [
  ['#1f3a5f', '#e0b25b', '#f2efe9', '#b5483b'],
  ['#2d4739', '#a3c4a8', '#f4ead5', '#d98e4f'],
  ['#3b2f4a', '#c97b84', '#f1d6b8', '#6a8caf'],
  ['#102a43', '#f0b429', '#e12d39', '#f5f7fa'],
  ['#4a3728', '#c8a27a', '#eadbc8', '#7a9e9f'],
  ['#0b3c49', '#86bbd8', '#f6aa1c', '#f2f2f2'],
];

function random(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function svgArtwork(index, width, height) {
  const rand = random(index + 1);
  const [bg, a, b, c] = PALETTES[index % PALETTES.length];
  const shapes = [];
  for (let i = 0; i < 14; i++) {
    const color = [a, b, c][i % 3];
    const x = Math.round(rand() * width);
    const y = Math.round(rand() * height);
    const r = Math.round((0.05 + rand() * 0.22) * Math.min(width, height));
    const opacity = (0.55 + rand() * 0.4).toFixed(2);
    if (i % 3 === 0) shapes.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${opacity}"/>`);
    else if (i % 3 === 1) shapes.push(`<rect x="${x - r}" y="${y - r / 2}" width="${2 * r}" height="${r}" fill="${color}" opacity="${opacity}" transform="rotate(${Math.round(rand() * 90)} ${x} ${y})"/>`);
    else shapes.push(`<path d="M ${x} ${y - r} L ${x + r} ${y + r} L ${x - r} ${y + r} Z" fill="${color}" opacity="${opacity}"/>`);
  }
  const stroke = Math.max(4, Math.round(Math.min(width, height) / 90));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${bg}"/>
  ${shapes.join('\n  ')}
  <path d="M 0 ${Math.round(height * 0.7)} C ${width * 0.3} ${height * 0.55}, ${width * 0.6} ${height * 0.9}, ${width} ${height * 0.65}" stroke="${b}" stroke-width="${stroke}" fill="none" opacity="0.8"/>
</svg>`;
}

export const DEMO_ARTWORKS = [
  { title: 'Reflets', artistName: 'Atelier ExpoSpace', altText: 'Composition abstraite : cercles, triangles et rectangles ocre, crème et rouges sur fond bleu nuit, traversés d’une ligne claire ondulée.', size: [1600, 1000] },
  { title: 'Fenêtre nord', artistName: 'Atelier ExpoSpace', altText: 'Composition abstraite verticale : formes vert pâle, beiges et orangées sur fond vert sombre.', size: [900, 1400] },
  { title: 'Quartier lumière', artistName: 'Atelier ExpoSpace', altText: 'Composition abstraite carrée : formes roses, pêche et bleu-gris sur fond violet profond.', size: [1200, 1200] },
  { title: 'Signal', artistName: 'Atelier ExpoSpace', altText: 'Composition abstraite panoramique : formes jaunes, rouges et blanches très contrastées sur fond bleu marine.', size: [1800, 900] },
  { title: 'Terre cuite', artistName: 'Atelier ExpoSpace', altText: 'Composition abstraite verticale : formes sable, crème et bleu-gris sur fond brun.', size: [1000, 1300] },
  { title: 'Marée', artistName: 'Atelier ExpoSpace', altText: 'Composition abstraite : formes bleu clair, orange vif et gris clair sur fond bleu canard.', size: [1500, 1100] },
];

export async function demoImage(index, size) {
  const [width, height] = size ?? DEMO_ARTWORKS[index % DEMO_ARTWORKS.length].size;
  return sharp(Buffer.from(svgArtwork(index, width, height))).jpeg({ quality: 88 }).toBuffer();
}
