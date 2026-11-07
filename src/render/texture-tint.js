/** Tint around the source's mean luminance, keeping its grain and alpha.
 * At strength 1, the average surface keeps the existing floor colour.
 * Strength 0 preserves the source; intermediate values blend both colours.
 * Mutates a decoded RGBA buffer once, never during the game loop.
 */
export function tintPixels(pixels, colour, strength = 1) {
  strength = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 1;
  let luminance = 0, weight = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    luminance += (pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722) * alpha;
    weight += alpha;
  }
  const mean = weight ? luminance / weight || 1 : 1;
  for (let i = 0; i < pixels.length; i += 4) {
    const shade = (pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722) / mean;
    for (let channel = 0; channel < 3; channel++) {
      const original = pixels[i + channel];
      const tinted = colour[channel] * shade;
      pixels[i + channel] = Math.max(0, Math.min(255,
        Math.round(original * (1 - strength) + tinted * strength)
      ));
    }
  }
  return pixels;
}
