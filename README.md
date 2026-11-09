# Web Viewer — 논문 도표 AR 뷰어

논문의 도표를 휴대폰 카메라로 비추면 대응하는 영상·음원을 재생합니다. 공개 관람자는 로그인이나 앱 설치가 필요 없습니다.

## 운영 구조

- 공개 뷰어: `site/index.html`, MindAR / A-Frame
- 관리자: `site/admin.html`, GitHub 저장소 전용 토큰으로 인증
- 자료: `site/media/`의 이미지·영상·음원·인식 파일과 `site/content/manifest.json`
- 호스팅: **Cloudflare Pages Free**, 기본 `pages.dev` 주소. R2, D1, Supabase, 결제수단 불필요
- 발행: 브라우저에서 인식 데이터 생성 → GitHub Git Data API로 파일과 manifest를 단일 커밋 → Pages 자동 배포

관람 화면은 Supabase에 접속하지 않습니다. 기존 `config.js`의 공개 Supabase 키는 관리자 가져오기 기능에만 사용합니다. GitHub 토큰은 코드·IndexedDB·localStorage에 저장하지 않고 탭 메모리에만 보관합니다.

## 처음 한 번: Cloudflare Pages 연결

1. Cloudflare 무료 계정으로 로그인합니다. Workers & Pages → Create → **Pages → Connect to Git**를 선택합니다.
2. GitHub `Junyyyong/webviewer` 저장소를 연결합니다. 가능하면 이 저장소만 접근 허용합니다.
3. Production branch: `main`, Framework: `None`, Build command: 비워 둠, Build output directory: **`site`**.
4. 배포된 `https://프로젝트명.pages.dev`를 열고 카메라·도표·영상·음원을 확인합니다.
5. `/admin.html`에서 관리자 토큰을 연결합니다. 상세 안내는 `/ADMIN_GUIDE.html`에 있습니다.

기존 Vercel 배포도 `site/`를 서빙하므로 코드 반영 시 같은 정적 구조로 작동합니다. 기존 논문 QR 주소가 있다면 해당 배포를 유지하거나 새 주소로 리디렉션하세요. 주소를 임의로 삭제하지 마세요.

## 평소 사용

1. 관리자 화면에서 이 저장소에만 `Contents: Read and write` 권한이 있는 fine-grained GitHub 토큰을 입력합니다.
2. 이미지 + 영상/음원 추가, 또는 기존 항목 삭제. 미발행 자료는 이 브라우저의 IndexedDB에 저장됩니다.
3. **발행하기**를 누릅니다. 많은 도판의 인식 데이터 생성에는 시간이 걸리므로 창을 열어 두세요.
4. GitHub 저장 완료 후 Pages 배포가 완료될 때까지 기다리고 관람 화면을 새로고침합니다.

관람 화면은 도표 인식 시 해당 영상·음원 하나만 내려받고 Blob URL로 재생합니다. Pages의 HTTP 구간 요청 제한을 보완하며, 최근 3개만 메모리에 유지합니다. 처음 영상 다운로드 중에는 대기 안내를 표시합니다.

일반 파일 하나당 25MiB 이하입니다. 큰 영상은 지원 브라우저에서 720p H.264 변환을 시도하며 여전히 크면 압축 안내를 표시합니다. `.mind` 인식 데이터는 20MiB 조각으로 자동 분할하고 뷰어에서 SHA-256 검증 후 원래 바이트로 재조립합니다. 도표 순서와 영상 연결은 manifest 한 파일이 결정합니다.

발행 중 추가·삭제·로그아웃을 막습니다. 파일 업로드나 GitHub 요청이 실패하면 공개 브랜치를 변경하지 않습니다. 다른 변경이 먼저 저장된 경우 강제로 덮어쓰지 않고 중단합니다. 다른 기기에서 변경한 뒤 예전 임시 자료가 남은 경우에는 먼저 보관할 자료를 확인한 후 ‘임시 자료 지우기’로 정리하고 다시 연결하세요.

파일 삭제 시 공개 목록에서 제외합니다. 이전 배포·Git 이력에는 남을 수 있으므로 완전 삭제 용도로 사용하지 마세요. 파일 크기, 저장소 크기, API 요청량, 무료 배포량 등 서비스 제한은 적용됩니다. Git 저장소는 영상 보관량이 커질수록 관리가 필요합니다.

## 기존 Supabase 이전 / 백업

초기 이전 자료: 도표 **51개**, 파일 **103개**, 원본 약 **855MiB**. 도표 ID, 이름, 비율, 인식 순서를 유지합니다. 원본은 `migration-backup/`에 보관하며 Git에 올리지 않습니다. 영상은 웹용 H.264/AAC로 변환하고 원본 인식 데이터는 바이트 변경 없이 분할합니다.

```sh
python3 tools/migrate-supabase.py
python3 tools/prepare-content.py
npm test
```

내보내기 스크립트는 기존 Supabase 프로젝트를 **읽기만** 합니다. 전체 다운로드와 SHA-256 기록이 끝난 후 이전 파일을 생성합니다. 크기 초과 파일이 있으면 백업만 만들고, `prepare-content.py`로 영상 변환·분할 작업을 합니다. 변환에는 로컬 ffmpeg/ffprobe가 필요합니다. 실패한 경우 기존 배포와 원본은 유지됩니다.

관리자의 ‘기존 자료 가져오기’는 공개 읽기가 가능한 Supabase에서 아직 없는 ID만 복사합니다. 기존 항목 수정 사항은 덮어쓰지 않습니다. 25MiB 초과 파일은 중단하고 안내합니다. 이 경우 위 스크립트로 별도 이전하거나 원본 파일을 압축해 추가하세요. 가져오기는 미발행 초안이며 발행해야 공개됩니다.

원본 Supabase는 새 배포와 실제 휴대폰 인식 검증이 끝난 뒤 정리하세요. 로컬 백업도 별도 보관하는 것을 권장합니다.

## 로컬 검증

```sh
npm run serve  # http://localhost:8642
npm test
```

카메라는 HTTPS 또는 localhost에서만 작동합니다. 로컬 주소는 다른 사람에게 공유하는 공개 주소가 아닙니다. 휴대폰 최종 테스트는 실제 HTTPS 배포 주소에서 합니다.
