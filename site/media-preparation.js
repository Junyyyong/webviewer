export const MIB = 1024 * 1024;
export const PROFILES = {
  tablet: {label:'아이패드 · 선명하게',longEdge:1920,shortEdge:1080,videoBps:5_000_000,audioBps:192_000},
  mobile: {label:'휴대폰 · 가볍게',longEdge:1280,shortEdge:720,videoBps:2_500_000,audioBps:128_000},
};
export function videoPlan({width,height,duration,size,force=false},profile='tablet') {
  if (![width,height,duration].every(n=>Number.isFinite(n)&&n>0)) throw new Error('영상 크기 또는 재생 시간을 확인할 수 없습니다. MP4 파일로 저장한 뒤 다시 시도하세요.');
  const p=PROFILES[profile]||PROFILES.tablet;
  const baseScale=Math.min(1,p.longEdge/Math.max(width,height),p.shortEdge/Math.min(width,height));
  const needsConversion=force||baseScale<0.999||size>22*MIB;
  const budget=(22*MIB*8/duration-p.audioBps)*0.94;
  const maxBps=Math.max(1,Math.min(p.videoBps,Math.floor(budget)));
  const reduced=needsConversion&&profile==='tablet'&&maxBps<2_000_000;
  const longEdge=reduced?1280:p.longEdge,shortEdge=reduced?720:p.shortEdge;
  const scale=needsConversion?Math.min(1,longEdge/Math.max(width,height),shortEdge/Math.min(width,height)):1;
  const w=Math.max(2,Math.floor(width*scale/2)*2),h=Math.max(2,Math.floor(height*scale/2)*2);
  if(needsConversion && maxBps<600_000) throw new Error('이 영상은 길어서 25MiB 안에 넣으면 화질이 크게 떨어집니다. 영상 길이를 나누거나 필요한 구간만 잘라 올려 주세요.');
  return {width:w,height:h,videoBps:maxBps,audioBps:p.audioBps,needsConversion,reduced,label:`${w}×${h}`,estimatedMiB:needsConversion?(maxBps+p.audioBps)*duration/8/MIB:size/MIB};
}
export const mp4RecorderType = (audioOnly=false) => {
  const types=audioOnly?['audio/mp4;codecs=mp4a.40.2','audio/mp4']:['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1.4d002a,mp4a.40.2','video/mp4;codecs=avc1,mp4a.40.2','video/mp4'];
  return globalThis.MediaRecorder && types.find(type=>MediaRecorder.isTypeSupported(type));
};
export async function loadMedia(file,audioOnly=false) {
  return new Promise((resolve,reject)=>{
    const media=document.createElement(audioOnly?'audio':'video');media.preload='auto';media.playsInline=true;
    const url=URL.createObjectURL(file);let timer;
    const finish=()=>{clearTimeout(timer);media.onloadeddata=null;media.onerror=null;};
    media.onloadeddata=()=>{finish();resolve(media);};
    media.onerror=()=>{finish();URL.revokeObjectURL(url);reject(new Error('파일을 재생할 수 없습니다. MP4 영상 또는 MP3/AAC 음원을 사용해 주세요.'));};
    timer=setTimeout(()=>{finish();media.pause();URL.revokeObjectURL(url);reject(new Error('파일 읽기 시간이 초과됐습니다.'));},30000);
    media.src=url;
  });
}
export function releaseMedia(media) {media.pause();URL.revokeObjectURL(media.src);media.removeAttribute('src');media.load();}
export async function convertMedia(file,{profile='tablet',audioOnly=false,onProgress=()=>{}}={}) {
  const type=mp4RecorderType(audioOnly);
  if(!type) throw new Error('이 브라우저는 MP4/AAC 자동 압축을 지원하지 않습니다. 최신 Chrome·Edge·Safari에서 시도하거나, 영상은 H.264 MP4·음원은 MP3/AAC로 압축 후 올려 주세요.');
  const media=await loadMedia(file,audioOnly);
  let audioContext,stream,rec,timer,frameId,animationId,stopped=false;
  try {
    if(!Number.isFinite(media.duration)||media.duration<=0) throw new Error('재생 시간을 읽을 수 없습니다.');
    const p=PROFILES[profile]||PROFILES.tablet;
    const plan=audioOnly?{audioBps:Math.min(p.audioBps,Math.floor(22*MIB*8/media.duration*0.94))}:videoPlan({width:media.videoWidth,height:media.videoHeight,duration:media.duration,size:file.size,force:true},profile);
    if(audioOnly&&plan.audioBps<96_000) throw new Error('음원이 너무 길어 음질 설정 안에서 압축하기 어렵습니다. 구간을 나눠 올려 주세요.');
    audioContext=new (window.AudioContext||window.webkitAudioContext)();await audioContext.resume();
    const dest=audioContext.createMediaStreamDestination();audioContext.createMediaElementSource(media).connect(dest);
    const tracks=[...dest.stream.getAudioTracks()];let canvas,ctx;
    if(!audioOnly) {
      canvas=document.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;ctx=canvas.getContext('2d');
      ctx.drawImage(media,0,0,canvas.width,canvas.height);tracks.unshift(...canvas.captureStream(30).getVideoTracks());
    }
    stream=new MediaStream(tracks);
    rec=new MediaRecorder(stream,{mimeType:type,audioBitsPerSecond:plan.audioBps,...(!audioOnly?{videoBitsPerSecond:plan.videoBps}:{})});
    const parts=[];rec.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
    const done=new Promise((resolve,reject)=>{rec.onstop=resolve;rec.onerror=e=>reject(e.error||new Error('변환에 실패했습니다.'));});
    const ended=new Promise((resolve,reject)=>{
      media.onended=()=>resolve();media.onerror=()=>reject(new Error('재생 도중 오류가 발생해 변환을 중단했습니다.'));
      timer=setTimeout(()=>reject(new Error('변환 시간이 초과됐습니다. 미완성 파일은 저장하지 않았습니다.')),media.duration*1500+30000);
    });
    const draw=()=>{
      if(stopped)return;
      if(ctx)ctx.drawImage(media,0,0,canvas.width,canvas.height);
      onProgress(media.currentTime/media.duration,plan);
      if(!audioOnly&&media.requestVideoFrameCallback)frameId=media.requestVideoFrameCallback(draw);
      else animationId=requestAnimationFrame(draw);
    };
    rec.start(1000);await media.play();draw();await Promise.race([ended,done.then(()=>{if(!media.ended)throw new Error('변환이 일찍 중단됐습니다.');})]);
    stopped=true;clearTimeout(timer);rec.stop();await done;
    const blob=new Blob(parts,{type:audioOnly?'audio/mp4':'video/mp4'});
    if(!blob.size||blob.size>25*MIB)throw new Error('변환 결과가 무료 파일 제한 25MiB를 넘었습니다. 가벼운 설정을 선택하거나 재생 구간을 나눠 주세요.');
    if(blob.size>=file.size && /\.(mp4|mp3|m4a|aac)$/i.test(file.name) && file.size<=25*MIB && (audioOnly || media.videoWidth<=plan.width && media.videoHeight<=plan.height))return file;
    return new File([blob],`${file.name.replace(/\.[^.]+$/,'')}-${audioOnly?'aac':plan.label}.${audioOnly?'m4a':'mp4'}`,{type:blob.type});
  } finally {
    stopped=true;clearTimeout(timer);if(frameId!==undefined)media.cancelVideoFrameCallback?.(frameId);if(animationId!==undefined)cancelAnimationFrame(animationId);
    if(rec&&rec.state!=='inactive')rec.stop();stream?.getTracks().forEach(t=>t.stop());await audioContext?.close().catch(()=>{});releaseMedia(media);
  }
}
