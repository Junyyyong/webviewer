export function thumbnailPath(imagePath) {
  return `media/thumbnails/${imagePath.split('/').pop().replace(/\.[^.]+$/, '')}.jpg`;
}
export async function createThumbnail(file) {
  if(typeof document==='undefined')return null;
  let image,cleanup=()=>{};
  try {
    if(typeof createImageBitmap==='function') {image=await createImageBitmap(file);cleanup=()=>image.close();}
    else {
      const url=URL.createObjectURL(file);cleanup=()=>URL.revokeObjectURL(url);
      image=new Image();image.src=url;await image.decode();
    }
    const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
    const scale=Math.min(1,640/Math.max(width,height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.84));
  } catch { return null; }
  finally {cleanup();}
}
