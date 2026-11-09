export async function requestCamera(mediaDevices=navigator.mediaDevices) {
  const profiles=[
    {facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:30}},
    {facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},
    {facingMode:'environment'},
  ];
  let last;
  for(const video of profiles) {
    try {return await mediaDevices.getUserMedia({audio:false,video});}
    catch(e){last=e;if(!['OverconstrainedError','ConstraintNotSatisfiedError','NotReadableError'].includes(e.name))throw e;}
  }
  throw last;
}
export async function improveFocus(track) {
  const caps=track.getCapabilities?.()||{};
  const advanced={};
  if(caps.focusMode?.includes('continuous'))advanced.focusMode='continuous';
  if(caps.exposureMode?.includes('continuous'))advanced.exposureMode='continuous';
  if(caps.whiteBalanceMode?.includes('continuous'))advanced.whiteBalanceMode='continuous';
  if(Object.keys(advanced).length) {try{await track.applyConstraints({advanced:[advanced]});}catch{/* Unsupported optional controls must not block the camera. */}}
  return caps;
}
export function cameraErrorMessage(error) {
  if(['NotAllowedError','PermissionDeniedError'].includes(error?.name))return '카메라 권한이 꺼져 있습니다. 주소창의 사이트 설정에서 카메라를 허용한 뒤 다시 시도해 주세요. 도표 목록에서는 카메라 없이 재생할 수 있습니다.';
  if(['NotFoundError','DevicesNotFoundError'].includes(error?.name))return '사용할 카메라를 찾지 못했습니다. 카메라가 있는 기기로 접속하거나 도표 목록에서 재생해 주세요.';
  if(error?.name==='NotReadableError')return '다른 앱에서 카메라를 사용 중일 수 있습니다. 카메라 앱을 닫은 뒤 다시 시도해 주세요.';
  return '카메라를 시작하지 못했습니다. 새로고침하거나 도표 목록에서 영상을 재생해 주세요.';
}
// Override only the camera acquisition boundary; preserve the bundled MindAR tracker.
export function installCameraAssist(AFRAME) {
  const proto=AFRAME.systems['mindar-image-system']?.prototype;
  if(!proto)throw new Error('카메라 인식 엔진을 불러오지 못했습니다. 새로고침해 주세요.');
  proto._startVideo=async function() {
    const video=document.createElement('video');this.video=video;
    for(const key of ['autoplay','muted','playsinline'])video.setAttribute(key,'');
    video.muted=true;Object.assign(video.style,{position:'absolute',top:'0px',left:'0px',zIndex:'-2'});this.container.appendChild(video);
    let stream;
    try {
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('카메라 API를 사용할 수 없습니다.');
      stream=await requestCamera();
      if(!this.el.sceneEl?.isConnected){stream.getTracks().forEach(t=>t.stop());return;}
      const track=stream.getVideoTracks()[0];await improveFocus(track);
      video.addEventListener('loadedmetadata',async()=>{
        video.setAttribute('width',video.videoWidth);video.setAttribute('height',video.videoHeight);
        this.el.emit('arCameraReady',{track,width:video.videoWidth,height:video.videoHeight});
        try {await this._startAR();}
        catch(error){stream.getTracks().forEach(t=>t.stop());this.el.emit('arError',{error:'TRACKING_FAIL',cause:error});this.ui.hideLoading();}
      },{once:true});
      video.srcObject=stream;
    } catch(error) {
      stream?.getTracks().forEach(t=>t.stop());this.el.emit('arError',{error:'VIDEO_FAIL',cause:error});this.ui.hideLoading();
    }
  };
}
export function selectedTarget(rows,id) {return rows.find(row=>row.id===id)?.mind_index??-1;}
export async function applyZoom(track,value) {
  const range=track.getCapabilities?.().zoom;
  if(!range)throw new Error('이 카메라는 배율 조절을 지원하지 않습니다.');
  const zoom=Math.max(range.min,Math.min(range.max,Number(value)));
  if(!Number.isFinite(zoom))throw new Error('잘못된 배율입니다.');
  await track.applyConstraints({advanced:[{zoom}]});return zoom;
}
