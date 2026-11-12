export function notices(a, b) {
  return a.canSee({
    x: b.x,
    y: b.y
  }) || a.canSee(b.eye) || a.canSee(b.center);
}
