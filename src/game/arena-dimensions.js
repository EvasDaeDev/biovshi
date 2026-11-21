// Keep square captures for the floor-history format and the isotropic camera.
export function arenaRaster({left=0,top=0,size=700,width=size,height=size}={}){
 return {left:left+(width-size)/2,top:top+(height-size)/2,size};
}
