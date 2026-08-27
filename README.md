# 문제풀이 챌린지

선생님이 단답형 문제를 올리고, 학생은 **로그인 없이 이름만 입력**해 풀면 즉시 자동 채점되는 웹앱입니다.

- 프론트엔드: Vite + React + TypeScript + Tailwind CSS v4 (정적 SPA, Netlify 배포)
- 백엔드: Supabase (Postgres + Auth). 별도의 서버 코드는 없습니다.
- **정답 문자열은 학생 브라우저로 절대 내려가지 않습니다.** 채점은 Postgres 함수 안에서만 일어납니다.

설계 배경과 결정 이유는 [`PLAN.md`](./PLAN.md) 에 있습니다.

---

## 셋업 순서

### ① Node.js 22 설치

<https://nodejs.org> 에서 LTS(22.x) 버전을 설치합니다. 설치 후 새 터미널에서 확인하세요.

```bash
node -v   # v22.x.x
npm -v
```

### ② 의존성 설치

프로젝트 폴더에서:

```bash
npm install
```

### ③ Supabase 프로젝트 생성 + 선생님 계정 만들기

1. <https://supabase.com> 에서 새 프로젝트를 만듭니다. (Region 은 Northeast Asia (Seoul) 추천)
2. 대시보드 → **Authentication → Users → Add user → Create new user**
   - 선생님이 쓸 이메일과 비밀번호를 입력하고 **Auto Confirm User 를 켭니다.**
3. 생성된 사용자 행의 **UID** 를 복사해 둡니다. (다음 단계에서 씁니다)

### ④ SQL 실행 (01 → 02 → 03 → 04 → 05 순서)

대시보드 → **SQL Editor** 에서 아래 파일 내용을 **순서대로** 붙여넣고 실행합니다.

| 순서 | 파일 | 내용 |
| --- | --- | --- |
| 1 | `supabase/01_schema.sql` | 테이블 · 인덱스 · 트리거 · 통계 뷰 |
| 2 | `supabase/02_rls.sql` | RLS 켜기 · anon 권한 회수 · 선생님 정책 |
| 3 | `supabase/03_functions.sql` | 학생용 RPC 4개 · 정답 정규화 함수 |
| 4 | `supabase/04_seed.sql` | 선생님 계정 등록 · 샘플 문제 3개 |
| 5 | `supabase/05_media.sql` | 문제 그림 컬럼 · 이미지 저장소(버킷)와 업로드 권한 |

> **`04_seed.sql` 은 그대로 실행하면 실패합니다.**
> 파일 안의 `<USER_UID>` 를 ③에서 복사한 UID 로, `<EMAIL>` 을 그 계정의 이메일로 바꾼 뒤 실행하세요.

### ⑤ `.env.local` 작성

`.env.example` 을 복사해 `.env.local` 파일을 만들고 값을 채웁니다.
값은 대시보드 → **Project Settings → API** 에 있습니다.

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

- `anon` (public) 키만 씁니다. **`service_role` 키는 절대 넣지 마세요.**
  `VITE_` 로 시작하는 값은 빌드 결과물에 그대로 포함되어 누구나 볼 수 있습니다.
  `anon` 키는 공개되어도 안전하도록 RLS 와 RPC 권한이 설계돼 있습니다.
- `.env.local` 은 `.gitignore` 에 들어 있어 커밋되지 않습니다.

### ⑥ 개발 서버 실행

```bash
npm run dev
```

- <http://localhost:5173> → 학생 화면
- <http://localhost:5173/teacher/login> → 선생님 로그인

### ⑦ 정답 비노출 검증 (꼭 해보세요)

학생 화면(<http://localhost:5173>)을 연 상태로 브라우저 개발자도구 콘솔에서:

```js
const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(
  '여기에_VITE_SUPABASE_URL',
  '여기에_VITE_SUPABASE_ANON_KEY',
);
console.log(await supabase.from('problems').select('*'));
```

**기대 결과:** `data: []` 또는 권한 오류(`permission denied for table problems`).
문제 목록과 정답이 그대로 찍힌다면 `02_rls.sql` 이 실행되지 않은 것입니다. 다시 실행하세요.

같은 방식으로 `students`, `submissions` 도 확인해 보면 좋습니다.

### ⑧ Netlify 배포

1. 이 폴더를 GitHub 저장소로 올립니다.
2. Netlify → **Add new site → Import an existing project** 로 저장소를 연결합니다.
   빌드 설정은 `netlify.toml` 에 있으므로 그대로 두면 됩니다. (`npm run build` → `dist`)
3. Netlify → **Site configuration → Environment variables** 에
   `VITE_SUPABASE_URL` 과 `VITE_SUPABASE_ANON_KEY` 를 등록합니다.
   (등록 후 **Deploys → Trigger deploy** 로 다시 배포해야 값이 반영됩니다.)
4. Supabase 대시보드 → **Authentication → URL Configuration** 에서
   **Site URL** 을 Netlify 주소(`https://<사이트이름>.netlify.app`)로 바꾸고,
   **Redirect URLs** 에도 같은 주소를 추가합니다.
5. 학생에게는 사이트 주소만 공유하면 됩니다. 선생님은 `/teacher/login` 으로 들어갑니다.

---

## 사용법

**선생님**
1. `/teacher/login` 에서 로그인
2. `새 문제` 로 문제 등록. 정답은 **한 줄에 하나씩** 적습니다.
   - 대소문자와 앞뒤·연속 공백은 채점 시 무시됩니다.
   - `10` 과 `십`, `서울` 과 `서울특별시` 는 서로 다른 답으로 처리되니 **표기 변형을 모두 적어주세요.**
3. 제목과 본문에 **수식**을 넣을 수 있습니다. 편집 화면 아래 미리보기로 바로 확인하세요.
   - 문장 안에 넣을 때는 `$y = x^2 - 4x + 3$` 처럼 달러 기호로 감쌉니다.
   - 가운데 크게 넣을 때는 `$$\frac{-b \pm \sqrt{b^2-4ac}}{2a}$$` 처럼 달러 두 개로 감쌉니다.
   - 달러 기호 자체를 쓰려면 `\$` 로 적습니다.
   - 수식에 오타가 있으면 학생 화면에 **붉은 물결 밑줄로 원문이 그대로** 보입니다. 미리보기에서 같은 모양이 나오면 문법을 고쳐주세요.
4. **그림**은 문제당 1장 올릴 수 있습니다 (PNG · JPG · WEBP · GIF, 5MB 이하). 본문 아래에 표시됩니다.
   - 그래프·도형처럼 수식으로 표현하기 어려운 것에 쓰세요.
   - 문제를 지우면 그림도 저장소에서 함께 지워집니다.
5. `공개로` 를 눌러야 학생 화면에 나타납니다.
6. `통계` 에서 문제별·학생별 현황을 봅니다.

**학생**
1. 사이트에 접속해 이름을 입력하고 시작
2. 문제를 골라 답을 제출하면 즉시 정답 여부가 표시됩니다. 오답이면 계속 다시 풀 수 있습니다.
3. `내 기록` 의 **이어하기 코드**를 복사해 두면 다른 기기에서도 이어서 풀 수 있습니다.

---

## 명령어

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 검사 후 `dist/` 로 빌드 |
| `npm run typecheck` | 타입 검사만 |
| `npm run preview` | 빌드 결과 미리보기 |

## 폴더 구조

```
supabase/    01~05 SQL 스크립트 (실행 순서 = 파일 이름 순서)
src/lib/     supabase 클라이언트 · 타입 · 학생 세션 · 에러 메시지 변환
src/components/  공통 레이아웃과 라우트 가드 2개
src/pages/   화면 8개
```
