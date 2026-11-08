// SVG uses column vectors and post-multiplies transform lists.
export function multiply(a,b) {
  return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function transformMatrix(text='') {
  let matrix=[1,0,0,1,0,0];
  for(const [,kind,args] of text.matchAll(/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g)) {
    const v=args.trim().split(/[\s,]+/).map(Number);let next;
    if(kind==='matrix')next=v;
    if(kind==='translate')next=[1,0,0,1,v[0],v[1]??0];
    if(kind==='scale')next=[v[0],0,0,v[1]??v[0],0,0];
    if(kind==='rotate'){
      const angle=v[0]*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),x=v[1]??0,y=v[2]??0;
      next=[c,s,-s,c,x-c*x+s*y,y-s*x-c*y];
    }
    matrix=multiply(matrix,next);
  }
  return matrix;
}
export const transformPoint=(m,p)=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
