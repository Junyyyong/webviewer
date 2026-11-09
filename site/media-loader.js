// Static Pages does not serve HTTP byte ranges. Blob URLs provide local seeking
// after downloading only the currently recognized figure's media.
export function createMediaLoader({fetcher=fetch,makeUrl=URL.createObjectURL,revokeUrl=URL.revokeObjectURL,maxEntries=3,isProtected=()=>false}={}) {
  const entries=new Map(),pending=new Map();
  function prune() {
    for(const [media,entry] of entries) {
      if(entries.size<=maxEntries) break;
      if(isProtected(media)) continue;
      media.pause(); media.removeAttribute('src'); media.load(); revokeUrl(entry.url); entries.delete(media);
    }
  }
  return {
    async ensure(media) {
      if(entries.has(media)) { const entry=entries.get(media);entries.delete(media);entries.set(media,entry);return; }
      if(pending.has(media)) return pending.get(media);
      const promise=(async()=>{
        const response=await fetcher(media.dataset.src);
        if(!response.ok) throw new Error('영상·음원을 불러오지 못했습니다. 인터넷 연결을 확인하고 도표를 다시 비춰 주세요.');
        const blob=await response.blob();
        if(!blob.size) throw new Error('재생 파일이 비어 있습니다.');
        const url=makeUrl(blob);media.src=url;media.load();entries.set(media,{url});prune();
      })();
      pending.set(media,promise);
      try { await promise; } finally { pending.delete(media); }
    },
    clear() { for(const entry of entries.values()) revokeUrl(entry.url);entries.clear(); }
  };
}
