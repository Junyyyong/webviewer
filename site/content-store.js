import { createThumbnail, thumbnailPath } from './thumbnails.js';
// GitHub credentials live only in memory. Draft files are stored locally in IndexedDB.
export const MAX_FILE = 25 * 1024 * 1024;
export function safePath(path) {
  if (typeof path !== 'string' || !/^(media|content)\/[a-zA-Z0-9_./-]+$/.test(path) || path.split('/').some(p => !p || p === '..' || p === '.')) throw new Error('잘못된 파일 경로');
  return path;
}
export function validateManifest(m) {
  if (m?.version !== 1 || !Array.isArray(m.targets)) throw new Error('지원하지 않는 자료 형식입니다.');
  if (m.mind_path) safePath(m.mind_path);
  if (m.mind_parts !== undefined && (!Array.isArray(m.mind_parts) || m.mind_parts.length > 20)) throw new Error("인식 데이터 조각 형식 오류");
  for (const part of m.mind_parts || []) safePath(part);
  const ids = new Set(), indices = new Set();
  for (const r of m.targets) {
    if (!r.id || ids.has(r.id) || typeof r.name !== 'string' && r.name !== null || !Number.isFinite(r.aspect) || r.aspect <= 0) throw new Error('도판 정보가 잘못되었습니다.');
    ids.add(r.id); safePath(r.image_path); safePath(r.video_path);
    if(r.thumbnail_path) safePath(r.thumbnail_path);
    if (r.mind_index !== null) {
      if (!Number.isInteger(r.mind_index) || r.mind_index < 0 || indices.has(r.mind_index)) throw new Error('도판 인식 순서가 중복되거나 잘못되었습니다.');
      indices.add(r.mind_index);
    }
  }
  const ordered = [...indices].sort((a,b)=>a-b);
  if (ordered.some((v,i)=>v!==i) || ordered.length && !m.mind_path && !m.mind_parts?.length) throw new Error('도판 인식 순서와 인식 데이터가 맞지 않습니다.');
  return m;
}
export function assetUrl(path) { return new URL(safePath(path), new URL('./', location.href)).href; }
export async function loadMindUrl(manifest) {
  if (manifest.mind_path) return assetUrl(manifest.mind_path);
  const chunks = [];
  for (const path of manifest.mind_parts || []) {
    const res = await fetch(assetUrl(path));
    if (!res.ok) throw new Error('인식 데이터를 내려받지 못했습니다. 잠시 후 다시 시도해 주세요.');
    chunks.push(await res.arrayBuffer());
  }
  const blob = new Blob(chunks, {type:'application/octet-stream'});
  if (manifest.mind_sha256) {
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
    if (hash !== manifest.mind_sha256) throw new Error('인식 데이터 무결성 검사에 실패했습니다. 새로고침해 주세요.');
  }
  return URL.createObjectURL(blob);
}
export async function readManifest() {
  const res = await fetch('./content/manifest.json', {cache:'no-store'});
  if (!res.ok) throw new Error('발행된 자료를 읽지 못했습니다. 관리자에게 문의해 주세요.');
  return validateManifest(await res.json());
}
const encode = blob => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob);
});
function draftDB() {
  return new Promise((resolve,reject)=>{ const req=indexedDB.open('webviewer-drafts',1); req.onupgradeneeded=()=>req.result.createObjectStore('drafts'); req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); });
}
async function localDraft(key, value, remove=false) {
  const db=await draftDB();
  try { return await new Promise((resolve,reject)=>{ const tx=db.transaction('drafts', value===undefined&&!remove?'readonly':'readwrite'); const s=tx.objectStore('drafts'); const r=remove?s.delete(key):value===undefined?s.get(key):s.put(value,key); let result; r.onsuccess=()=>result=r.result; tx.oncomplete=()=>resolve(result); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error||new Error('임시 저장 실패')); }); }
  finally { db.close(); }
}
export class ContentStore {
  constructor({owner,repo,branch='main'}) {
    if (![owner,repo,branch].every(v=>/^[\w.-]+$/.test(v))) throw new Error('저장소 설정 오류');
    this.owner=owner; this.repo=repo; this.branch=branch; this.key=`${owner}/${repo}/${branch}`; this.files=new Map(); this.urls=new Map(); this.rows=[];
  }
  async api(path, body, method=body?'POST':'GET') {
    const r=await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}/${path}`,{method,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${this.token}`,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await r.json();
    if (!r.ok) throw new Error(`GitHub ${r.status}: ${data.message || '요청 실패'}${r.status===403?' — 토큰의 Contents 읽기/쓰기 권한과 API 사용 제한을 확인하세요.':''}`);
    return data;
  }
  async login(token) {
    this.token=token.trim();
    const head=await this.api(`git/ref/heads/${this.branch}`); this.head=head.object.sha;
    let manifest;
    try {
      const f=await this.api(`contents/site/content/manifest.json?ref=${this.head}`);
      this.manifestSha=f.sha;
      manifest=validateManifest(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(f.content.replace(/\s/g,'')),c=>c.charCodeAt(0)))));
    } catch(e) { this.token=''; throw new Error(`저장소의 이전된 자료를 읽을 수 없습니다. 먼저 코드와 자료를 배포해야 합니다. ${e.message}`); }
    this.rows=structuredClone(manifest.targets); this.mindPath=manifest.mind_path;
    const draft=await localDraft(this.key);
    if(draft) {
      if(draft.head!==this.head && (!draft.manifestSha || draft.manifestSha!==this.manifestSha)) throw new Error('다른 발행 이후의 임시 자료가 이 브라우저에 남아 있습니다. 먼저 임시 자료 지우기를 누른 뒤 로그인하세요.');
      this.rows=draft.rows; this.files=new Map(draft.files); this.dirty=true;
    }
  }
  async save() { await localDraft(this.key,{head:this.head,manifestSha:this.manifestSha,rows:this.rows,files:[...this.files]}); this.dirty=true; }
  async discard() { await localDraft(this.key,undefined,true); }
  logout() { this.token=''; for(const u of this.urls.values()) URL.revokeObjectURL(u); this.urls.clear(); }
  url(path) {
    safePath(path);
    if(this.files.has(path)) { if(!this.urls.has(path)) this.urls.set(path,URL.createObjectURL(this.files.get(path))); return this.urls.get(path); }
    return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.head}/site/${path}`;
  }
  async add(row, image, video) {
    for(const f of [image,video]) if(!f.size || f.size>MAX_FILE) throw new Error('파일은 0바이트보다 크고 25MiB 이하여야 합니다.');
    const preview=await createThumbnail(image);
    if(preview) { row={...row,thumbnail_path:safePath(thumbnailPath(row.image_path))}; this.files.set(row.thumbnail_path,preview); }
    this.files.set(row.image_path,image); this.files.set(row.video_path,video); this.rows.push({...row,mind_index:null}); await this.save();
  }
  async remove(id) {
    const r=this.rows.find(r=>r.id===id); this.rows=this.rows.filter(r=>r.id!==id);
    for(const p of [r.image_path,r.video_path,r.thumbnail_path].filter(Boolean)) { this.files.delete(p); if(this.urls.has(p)) URL.revokeObjectURL(this.urls.get(p)); this.urls.delete(p); }
    await this.save();
  }
  async publish(buffer, progress=()=>{}) {
    const mind=new Blob(buffer ? [buffer] : []); if(this.rows.length && !mind.size || mind.size>400*1024*1024) throw new Error('인식 데이터가 비어 있거나 너무 큽니다.');
    const latest=await this.api(`git/ref/heads/${this.branch}`);
    const baseHead=latest.object.sha;
    if(baseHead!==this.head) {
      const current=this.manifestSha ? await this.api(`contents/site/content/manifest.json?ref=${baseHead}`) : null;
      if(!current || current.sha!==this.manifestSha) throw new Error('다른 변경이 먼저 저장되었습니다. 임시 자료를 보존한 상태로 중단했습니다. 새 변경과 병합 후 다시 진행하세요.');
    }
    const id=crypto.randomUUID(), parts=[], pending=new Map(this.files);
    const chunkSize=20*1024*1024;
    for(let offset=0,i=0;offset<mind.size;offset+=chunkSize,i++) {
      const path=`media/targets-${id}-${i}.mindpart`; parts.push(path); pending.set(path,mind.slice(offset,offset+chunkSize));
    }
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await mind.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
    const manifest=validateManifest({version:1,published_at:new Date().toISOString(),mind_path:null,mind_parts:parts,mind_sha256:hash,targets:this.rows.map((r,i)=>({...r,mind_index:i}))});
    pending.set('content/manifest.json',new Blob([JSON.stringify(manifest,null,2)]));
    const tree=[]; let done=0, manifestSha;
    for(const [path,blob] of pending) {
      safePath(path); if(blob.size>MAX_FILE) throw new Error('파일 크기 제한 초과');
      progress(`파일 저장 중 ${++done}/${pending.size}`);
      const b=await this.api('git/blobs',{content:await encode(blob),encoding:'base64'});
      if(path==='content/manifest.json') manifestSha=b.sha;
      tree.push({path:`site/${path}`,mode:'100644',type:'blob',sha:b.sha});
    }
    const commit=await this.api(`git/commits/${baseHead}`);
    const nextTree=await this.api('git/trees',{base_tree:commit.tree.sha,tree});
    const next=await this.api('git/commits',{message:`Publish ${manifest.targets.length} AR figures`,tree:nextTree.sha,parents:[baseHead]});
    // Non-force update rejects concurrent changes. Assets and manifest become visible together.
    await this.api(`git/refs/heads/${this.branch}`,{sha:next.sha,force:false},'PATCH');
    this.head=next.sha; this.manifestSha=manifestSha; this.rows=manifest.targets; this.mindPath=null; this.files.clear(); this.dirty=false;
    for(const u of this.urls.values()) URL.revokeObjectURL(u); this.urls.clear();
    try { await this.discard(); } catch { progress('발행은 완료됐으나 이 브라우저의 임시 자료 정리에 실패했습니다.'); }
    return `https://github.com/${this.owner}/${this.repo}/commit/${next.sha}`;
  }
  async importSupabase(config, progress=()=>{}) {
    const source=new URL(config.url); if(source.protocol!=='https:' || !source.hostname.endsWith('.supabase.co')) throw new Error('Supabase 프로젝트 주소를 확인해 주세요.');
    const headers={apikey:config.key};
    const res=await fetch(`${source.origin}/rest/v1/targets?select=*&order=created_at.asc`,{headers});
    if(!res.ok) throw new Error('기존 목록을 읽을 수 없습니다. Supabase 프로젝트 활성 상태와 공개 읽기 권한을 확인하세요.');
    const rows=await res.json(); const additions=[],files=new Map();
    for(const [i,r] of rows.entries()) {
      if(this.rows.some(x=>x.id===r.id)) continue;
      const item={...r,mind_index:null};
      for(const k of ['image_path','video_path']) {
        const p=safePath('media/'+r[k]);
        progress(`기존 자료 가져오는 중 ${i+1}/${rows.length}`);
        const f=await fetch(`${source.origin}/storage/v1/object/public/${encodeURIComponent(config.bucket||'media')}/${r[k].split('/').map(encodeURIComponent).join('/')}`);
        if(!f.ok) throw new Error(`기존 파일 읽기 실패: ${r[k]}`);
        const blob=await f.blob(); if(!blob.size||blob.size>MAX_FILE) throw new Error(`${r[k]}: 파일 크기 제한 초과. 원본은 변경하지 않았습니다.`);
        files.set(p,blob); item[k]=p;
      }
      const preview=await createThumbnail(files.get(item.image_path));
      if(preview) {item.thumbnail_path=safePath(thumbnailPath(item.image_path));files.set(item.thumbnail_path,preview);}
      additions.push(item);
    }
    // No partial import on a failed file.
    for(const [p,b] of files) this.files.set(p,b); this.rows.push(...additions); await this.save(); return additions.length;
  }
}
