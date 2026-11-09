// Registration hints only: these measurements are not a recognition score.
export function inspectPixels(rgba,width,height,originalWidth=width,originalHeight=height) {
  const gray=new Float32Array(width*height);let total=0,squares=0,border=0,whiteBorder=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,a=rgba[i*4+3]/255;
    const value=(rgba[i*4]*0.2126+rgba[i*4+1]*0.7152+rgba[i*4+2]*0.0722)*a+255*(1-a);
    gray[i]=value;total+=value;squares+=value*value;
    if(x<width*.1||x>=width*.9||y<height*.1||y>=height*.9){border++;if(value>245)whiteBorder++;}
  }
  const contrast=Math.sqrt(Math.max(0,squares/gray.length-(total/gray.length)**2));
  const warnings=[];
  if(Math.min(originalWidth,originalHeight)<500)warnings.push('원본 해상도가 낮습니다. 가능하면 PDF·원본에서 선명하게 내보내 주세요.');
  if(contrast<25)warnings.push('밝기 대비가 낮습니다. 인쇄본과 동일한 선명한 원본을 사용해 주세요.');
  if(whiteBorder/border>.88)warnings.push('가장자리에 흰 여백이 많습니다. 실제 인쇄 도표와 맞는 범위로 잘라 등록하면 도움이 될 수 있습니다.');
  return {warnings,contrast:Math.round(contrast),whiteBorder:Math.round(whiteBorder/border*100)};
}
export async function inspectTarget(file) {
  const bitmap=await createImageBitmap(file);
  try {
    const scale=Math.min(1,320/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return inspectPixels(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,bitmap.width,bitmap.height);
  } finally {bitmap.close();}
}
