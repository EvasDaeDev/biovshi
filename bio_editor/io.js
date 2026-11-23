export const byId=id=>document.getElementById(id);
export const numeric=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
export const htmlOption=(name,value)=>new Option(name,String(value));
export const svgNode=(tag,attributes,parent)=>{
 const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
 for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);
 parent?.append(node);
 return node;
};
export function status(message='',error=false){
 const node=byId('status');
 node.textContent=message;
 node.dataset.error=String(error);
}
export function downloadJson(filename,object){
 const url=URL.createObjectURL(new Blob([JSON.stringify(object,null,2)+'\n'],{type:'application/json'}));
 const anchor=document.createElement('a');
 anchor.href=url;anchor.download=filename;anchor.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function importJson(input,load){
 input.onchange=async()=>{
  const file=input.files[0];
  input.value='';
  if(!file)return;
  try{
   if(file.size>3*1024*1024)throw Error('Размер JSON превышает 3 МБ.');
   await load(JSON.parse(await file.text()));
   status('Проект открыт.');
  }catch(error){status(error.message,true);}
 };
}
