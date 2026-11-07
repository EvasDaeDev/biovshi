/** Tint around the source's mean luminance, keeping its grain and alpha.
 * The average surface keeps the existing floor colour instead of becoming grey.
 * Mutates a decoded RGBA buffer once, never during the game loop.
 */
export function tintPixels(pixels, colour) {
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
      pixels[i + channel] = Math.max(0, Math.min(255, Math.round(colour[channel] * shade)));
    }
  }
  return pixels;
}
