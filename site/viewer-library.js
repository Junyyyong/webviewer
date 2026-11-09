// Render untrusted figure names using textContent; no authentication is needed.
export function mountLibrary({rows,assetUrl,loader,state,onSelect}) {
  const dialog=document.querySelector('#figure-library'),list=document.querySelector('#figure-list'),search=document.querySelector('#figure-search'),player=document.querySelector('#library-player'),status=document.querySelector('#library-status');
  let current;
  function stop() {if(current){current.pause();current=null;}state.manualMedia=null;state.manual=false;player.replaceChildren();status.textContent='';}
  function render() {
    list.replaceChildren();const term=search.value.trim().toLocaleLowerCase();
    rows.forEach((row,index)=>{
      const name=row.name||`도표 ${index+1}`;
      if(!`${index+1} ${name}`.toLocaleLowerCase().includes(term))return;
      const item=document.createElement('div');item.className='figure-row';
      const title=document.createElement('strong');title.textContent=`${index+1}. ${name}`;
      const scan=document.createElement('button');scan.textContent='이 도표만 인식';scan.type='button';scan.onclick=()=>{stop();dialog.close();onSelect(row);};
      const play=document.createElement('button');play.textContent=/\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba)$/i.test(row.video_path)?'바로 듣기':'바로 보기';play.type='button';
      play.onclick=async()=>{
        stop();state.manual=true;
        for(const media of document.querySelectorAll('a-assets video,a-assets audio'))media.pause();
        current=document.createElement(play.textContent==='바로 듣기'?'audio':'video');const media=current;
        media.controls=true;media.playsInline=true;media.muted=!state.soundOn;media.dataset.src=assetUrl(row.video_path);state.manualMedia=media;
        const heading=document.createElement('p');heading.textContent=name;player.replaceChildren(heading,media);status.textContent='파일을 불러오는 중…';
        try {await loader.ensure(media);if(current!==media)return;await media.play();status.textContent='';}
        catch(e){if(current===media)status.textContent=media.src?'재생 버튼을 눌러 주세요.':e.message;}
      };
      item.append(title,scan,play);list.append(item);
    });
    if(!list.children.length){const empty=document.createElement('p');empty.textContent='검색 결과가 없습니다.';list.append(empty);}
  }
  for(const button of document.querySelectorAll('[data-open-library]'))button.addEventListener('click',()=>{render();dialog.showModal();});
  document.querySelector('#scan-all').onclick=()=>{stop();dialog.close();onSelect(null);};
  document.querySelector('#library-close').onclick=()=>dialog.close();dialog.addEventListener('close',stop);
  search.addEventListener('input',render);
}
