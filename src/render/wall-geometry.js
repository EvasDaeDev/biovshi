/** Offset a convex arena outwards and unwrap a wall ribbon in centimetres.
 * UV y=width is the image's bottom edge, exactly on the playable boundary.
 */
export function wallRibbon(points, width) {
  if (points.length < 3 || !Number.isFinite(width) || width <= 0) throw new Error('Invalid wall geometry');
  const area = points.reduce((sum,p,i) => { const q=points[(i+1)%points.length]; return sum+p.x*q.y-q.x*p.y; },0);
  if (!area) throw new Error('Degenerate arena');
  const sign=Math.sign(area);
  const edges=points.map((a,i)=>{
    const b=points[(i+1)%points.length];
    const length=Math.hypot(b.x-a.x,b.y-a.y);
    if (!length) throw new Error('Zero-length arena edge');
    return { length, normal:{ x:sign*(b.y-a.y)/length, y:-sign*(b.x-a.x)/length } };
  });
  const outer=points.map((p,i)=>{
    const prev=edges[(i+edges.length-1)%edges.length].normal, next=edges[i].normal;
    const denominator=1+prev.x*next.x+prev.y*next.y;
    if (denominator < 1e-8) throw new Error('Invalid arena corner');
    return {x:p.x+width*(prev.x+next.x)/denominator,y:p.y+width*(prev.y+next.y)/denominator};
  });
  let distance=0;
  const faces=points.map((p,i)=>{
    const next=(i+1)%points.length, length=edges[i].length;
    const face={
      world:[p,points[next],outer[next],outer[i]],
      uv:[{x:distance,y:width},{x:distance+length,y:width},{x:distance+length,y:0},{x:distance,y:0}],
      length, normal:edges[i].normal,
    };
    distance+=length;
    return face;
  });
  return {inner:points,outer,faces,perimeter:distance};
}

/** SVG affine matrix mapping a triangle's texture coordinates to the wall. */
export function triangleMatrix(source, target) {
  const [p,q,r]=source,[a,b,c]=target;
  const u=q.x-p.x,v=q.y-p.y,s=r.x-p.x,t=r.y-p.y,det=u*t-s*v;
  if (Math.abs(det)<1e-9) throw new Error('Degenerate wall triangle');
  const A=((b.x-a.x)*t-(c.x-a.x)*v)/det;
  const C=((c.x-a.x)*u-(b.x-a.x)*s)/det;
  const B=((b.y-a.y)*t-(c.y-a.y)*v)/det;
  const D=((c.y-a.y)*u-(b.y-a.y)*s)/det;
  return [A,B,C,D,a.x-A*p.x-C*p.y,a.y-B*p.x-D*p.y];
}
