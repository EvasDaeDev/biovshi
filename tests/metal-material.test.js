import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {installMetalMaterials,UI_METAL_PRESET} from '../src/ui/metal-material.js';

function drawingDocument(){
  const urls=[],properties=new Map();
  let canvasCount=0;
  const doc={
    defaultView:{URL:{createObjectURL(blob){
      urls.push(blob);
      return 'blob:metal/'+urls.length;
    }}},
    documentElement:{style:{setProperty:(name,value)=>properties.set(name,value)}},
    createElement(tag){
      assert.equal(tag,'canvas');canvasCount++;
      const hash=createHash('sha256');
      const record=(...values)=>hash.update(JSON.stringify(values));
      const canvas={width:0,height:0,toBlob(callback){
        callback({width:this.width,height:this.height,drawing:hash.digest('hex')});
      }};
      const context={
        createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
        putImageData:image=>hash.update(image.data),
        beginPath(){},
        moveTo:(x,y)=>record('M',x,y),
        lineTo:(x,y)=>record('L',x,y),
        stroke(){record(this.strokeStyle,this.lineWidth,this.globalCompositeOperation);},
        translate:(x,y)=>record('T',x,y),
        rotate:r=>record('R',r),
        drawImage:source=>record('draw',source.width,source.height),
      };
      canvas.getContext=()=>context;
      return canvas;
    },
  };
  return {doc,urls,properties,get canvasCount(){return canvasCount;}};
}

test('metal surface and edge strips are deterministic and are shared for the life of a document',async()=>{
  assert.deepEqual(UI_METAL_PRESET,{
    seed:2177,grain:.84,blotches:.37,edgeWear:.75,scratches:.76,lineIrregularity:.28,frameDepth:.27,
  });
  const first=drawingDocument(),second=drawingDocument();
  const ready=installMetalMaterials(first.doc);
  assert.equal(installMetalMaterials(first.doc),ready);
  await ready;
  await installMetalMaterials(first.doc);
  assert.equal(first.canvasCount,5);
  assert.deepEqual(first.urls.map(({width,height})=>[width,height]),
    [[512,512],[192,8],[192,8],[8,192],[8,192]]);
  assert.deepEqual([...first.properties.keys()],
    ['--metal-surface','--metal-top','--metal-bottom','--metal-left','--metal-right']);

  await installMetalMaterials(second.doc);
  assert.deepEqual(second.urls,first.urls,'reloading with the same seed repeats the material');
});

test('missing image export keeps the CSS material fallback available',async()=>{
  const doc={defaultView:{URL:{}},createElement(){assert.fail('Canvas must not be built without an image URL API');}};
  await assert.doesNotReject(installMetalMaterials(doc));
});
