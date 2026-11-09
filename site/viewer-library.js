// Names are rendered with textContent. Images are small, lazy-loaded previews.
export function mountLibrary({rows,assetUrl,loader,state}) {
  const dialog=document.querySelector('#figure-library'),list=document.querySelector('#figure-list');
  let current;
  function stopCurrent() {
    if(!current)return;
    const {media,visual,poster,status}=current;
    media.pause();visual.replaceChildren(poster);status.textContent='';current=null;state.manualMedia=null;
  }
  function pauseAR() {
    for(const media of document.querySelectorAll('a-assets video,a-assets audio,#pinned video,#pinned audio'))media.pause();
  }
  function render() {
    stopCurrent();list.replaceChildren();
    rows.forEach((row,index)=>{
      const name=row.name||`도표 ${index+1}`;
      const audioOnly=/\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba)$/i.test(row.video_path);
      const item=document.createElement('article');item.className='figure-card';
      const visual=document.createElement('div');visual.className='figure-visual';
      const poster=document.createElement('button');poster.className='figure-poster';poster.type='button';poster.setAttribute('aria-label',`${audioOnly?'음원':'영상'} 재생: ${name}`);
      const image=document.createElement('img');image.src=assetUrl(row.thumbnail_path||row.image_path);image.alt=name;image.loading='lazy';image.decoding='async';image.width=640;image.height=Math.max(1,Math.round(640*row.aspect));
      image.addEventListener('error',()=>{if(row.thumbnail_path)image.src=assetUrl(row.image_path);},{once:true});
      poster.append(image);visual.append(poster);
      const status=document.createElement('p');status.className='figure-status';status.setAttribute('role','status');
      item.append(visual,status);list.append(item);
      poster.onclick=async()=>{
        stopCurrent();state.manual=true;pauseAR();
        const media=document.createElement(audioOnly?'audio':'video');
        media.controls=true;media.playsInline=true;media.setAttribute('playsinline','');media.setAttribute('webkit-playsinline','');media.preload='none';media.muted=!state.soundOn;media.dataset.src=assetUrl(row.video_path);
        if(audioOnly) {
          const cover=image.cloneNode();cover.src=image.currentSrc||image.src;cover.alt='';visual.replaceChildren(cover,media);
        } else {
          media.poster=image.currentSrc||image.src;media.style.aspectRatio=String(1/row.aspect);
          media.addEventListener('loadedmetadata',()=>{if(media.videoWidth&&media.videoHeight)media.style.aspectRatio=`${media.videoWidth}/${media.videoHeight}`;});
          visual.replaceChildren(media);
        }
        current={media,visual,poster,status};state.manualMedia=media;status.textContent='불러오는 중…';
        media.addEventListener('playing',()=>{if(current?.media===media)status.textContent='';});
        media.addEventListener('error',()=>{
          if(current?.media!==media)return;stopCurrent();status.textContent='파일을 재생하지 못했습니다. 이미지를 눌러 다시 시도해 주세요.';
        });
        try {
          await loader.ensure(media);if(current?.media!==media)return;
          await media.play();if(current?.media===media)status.textContent='';
        } catch(e) {
          if(current?.media!==media)return;
          if(media.src)status.textContent='재생 버튼을 눌러 주세요.';
          else {stopCurrent();status.textContent='불러오지 못했습니다. 이미지를 눌러 다시 시도해 주세요.';}
        }
      };
    });
    if(!list.children.length){const empty=document.createElement('p');empty.textContent='검색 결과가 없습니다.';list.append(empty);}
  }
  for(const button of document.querySelectorAll('[data-open-library]'))button.addEventListener('click',()=>{state.manual=true;pauseAR();render();dialog.showModal();});
  document.querySelector('#library-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',async()=>{
    stopCurrent();state.manual=false;
    const media=state.pinned||document.querySelector('a-assets [data-on-target]');
    if(media) {
      media.muted=!state.soundOn;
      try {await loader.ensure(media);if(!dialog.open&&!state.manual&&(state.pinned===media||media.dataset.onTarget))await media.play();} catch { /* Camera playback can be retried by recognizing the target again. */ }
    }
  });
}
