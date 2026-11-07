import { ctx } from "../game/state.js";
export function random() {
  ctx.seed = Math.imul(ctx.seed, 1664525) + 1013904223 >>> 0;
  return ctx.seed / 4294967296;
}
