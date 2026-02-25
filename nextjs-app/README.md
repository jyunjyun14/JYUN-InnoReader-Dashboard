# 뉴스 대시보드

비즈니스 인사이트를 위한 AI 뉴스 검색·분석 대시보드.
분야별 키워드로 글로벌 뉴스를 수집하고, 관련도 스코어링 + 번역 + 엑셀 내보내기까지 제공합니다.

## 기술 스택

| 항목 | 기술 |
|------|------|
| 프레임워크 | Next.js 14 (App Router) |
| 언어 | TypeScript |
| 스타일 | Tailwind CSS + shadcn/ui |
| DB | PostgreSQL — Neon 서버리스 |
| ORM | Prisma 5 |
| 인증 | NextAuth.js v4 (Credentials) |
| 뉴스 수집 | NewsAPI |
| 배포 | Vercel |

---

## Vercel 배포 가이드

### 1단계: Neon PostgreSQL 데이터베이스 생성

1. [neon.tech](https://neon.tech) 에서 무료 계정 생성 (신용카드 불필요)
2. 새 프로젝트 생성 (예: `news-dashboard`)
3. **Connection Details** 탭에서 두 URL 복사:
   - **Pooled connection** → `DATABASE_URL`
   - **Direct connection** → `DIRECT_URL`

> **두 URL이 필요한 이유**
> Vercel 서버리스 환경은 연결 풀링(pgBouncer)이 필요하지만,
> `prisma migrate`는 pgBouncer를 우회한 직접 연결이 필요합니다.

---

### 2단계: NewsAPI 키 발급

1. [newsapi.org](https://newsapi.org) → **Get API Key** (무료, 카드 불필요)
2. 발급된 키를 `NEWS_API_KEY`에 사용

> 무료 플랜: 100 req/day · 최근 1개월 기사 · 개인 프로젝트용

---

### 3단계: Vercel 환경변수 설정

[vercel.com](https://vercel.com) → 프로젝트 → **Settings → Environment Variables**

#### 필수 환경변수

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `DATABASE_URL` | Neon **Pooled** connection URL | `postgresql://...?pgbouncer=true&sslmode=require` |
| `DIRECT_URL` | Neon **Direct** connection URL | `postgresql://...?sslmode=require` |
| `NEXTAUTH_URL` | 배포된 앱 전체 URL | `https://your-app.vercel.app` |
| `NEXTAUTH_SECRET` | 세션 암호화 키 (32바이트 이상) | `openssl rand -base64 32` 결과 |
| `NEWS_API_KEY` | NewsAPI 키 | `9f9c5f08880d45efa9c9fdb35b6d32f9` |

#### 선택 환경변수

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `ACCESS_CODE` | (없음, 개방) | 사이트 진입 시 요구할 접근 코드 |
| `ADMIN_EMAIL` | (없음) | 이 이메일로 로그인 시 자동으로 관리자(ADMIN) 승격 |
| `NEXT_PUBLIC_APP_NAME` | `뉴스 대시보드` | 헤더에 표시될 앱 이름 |
| `NEXT_PUBLIC_APP_URL` | (없음) | 앱 공개 URL (이메일 링크 등에 사용) |
| `RESEND_API_KEY` | (없음) | 비밀번호 재설정 이메일 발송용 ([resend.com](https://resend.com) 무료: 3,000건/월) |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` | 발신 이메일 주소 |
| `GOOGLE_TRANSLATE_API_KEY` | (없음, 무료 대체 사용) | Google Cloud 번역 API (월 50만 자 무료) |
| `LIBRETRANSLATE_URL` | (없음) | LibreTranslate 서버 URL |
| `LIBRETRANSLATE_API_KEY` | (없음) | LibreTranslate API 키 |

#### NEXTAUTH_SECRET 생성

```bash
# macOS / Linux
openssl rand -base64 32

# Windows PowerShell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

---

### 4단계: 데이터베이스 초기화

Vercel 배포 완료 후 **최초 1회** 실행 (로컬에서):

```bash
# .env.local의 DATABASE_URL을 DIRECT_URL 값으로 임시 교체 후 실행
npx prisma db push

# 또는 마이그레이션 방식
DATABASE_URL="<DIRECT_URL 값>" npx prisma migrate deploy
```

---

### 5단계: 첫 관리자 계정 설정

1. `ADMIN_EMAIL=본인이메일@example.com` 환경변수 설정 후 재배포
2. `/register` 에서 해당 이메일로 회원가입
3. 로그인 시 자동으로 ADMIN으로 승격
4. `/admin` 에서 다른 사용자 역할 관리 가능

---

## 접근 코드 보호 (방법 B)

`ACCESS_CODE` 환경변수를 설정하면 모든 페이지 진입 전 코드 입력을 요구합니다.

```
ACCESS_CODE=your-secret-code
```

- 쿠키 유효기간: 30일 (자동 재입력 불필요)
- 저장 방식: SHA-256 해시 (httpOnly 쿠키 — JS 접근 불가)
- 미설정 시: 누구나 접근 가능 (개발 환경 기본값)

사용자에게 코드만 알려주면 30일간 자유롭게 사용 가능합니다.

---

## 로컬 개발 환경 설정

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env.local
# .env.local 에서 DATABASE_URL, NEXTAUTH_SECRET, NEWS_API_KEY 등 입력

# 3. DB 스키마 동기화 (Neon 직접 연결 URL 사용)
npx prisma db push

# 4. 개발 서버 실행
npm run dev
# → http://localhost:3000
```

### 로컬 SQLite 빠른 시작 (PostgreSQL 없이)

`.env.local`:
```
DATABASE_URL="file:./prisma/dev.db"
```

`prisma/schema.prisma` 에서:
```prisma
datasource db {
  provider = "sqlite"   # postgresql → sqlite 변경
  url      = env("DATABASE_URL")
  # directUrl 줄 삭제
}
```

모든 `@db.Text` 어노테이션 제거 후 `npx prisma db push` 실행.

---

## 주요 기능

| 기능 | 경로 |
|------|------|
| 뉴스 대시보드 | `/dashboard` |
| 분야·키워드 관리 | `/settings/keywords` |
| 스코어링 설정 | `/settings/scoring` |
| 프로필·비밀번호 변경 | `/settings` |
| 관리자 패널 | `/admin` (ADMIN 역할 전용) |
| 사용자 관리 | `/admin/users` |
| 비밀번호 찾기 | `/forgot-password` |

---

## 환경변수 전체 목록

| 변수명 | 필수 | 설명 |
|--------|:----:|------|
| `DATABASE_URL` | ✅ | PostgreSQL 풀링 URL (Neon pooled) |
| `DIRECT_URL` | ✅ | PostgreSQL 직접 URL (마이그레이션 전용) |
| `NEXTAUTH_SECRET` | ✅ | 세션 JWT 암호화 키 (32바이트 이상 랜덤) |
| `NEXTAUTH_URL` | ✅ | 배포된 앱 URL (`https://...vercel.app`) |
| `NEWS_API_KEY` | ✅ | NewsAPI 뉴스 검색 키 |
| `ACCESS_CODE` | ❌ | 사이트 접근 코드 (미설정 시 개방) |
| `ADMIN_EMAIL` | ❌ | 최초 관리자 이메일 (로그인 시 ADMIN 자동 승격) |
| `NEXT_PUBLIC_APP_NAME` | ❌ | 앱 표시 이름 |
| `NEXT_PUBLIC_APP_URL` | ❌ | 앱 공개 URL |
| `RESEND_API_KEY` | ❌ | 비밀번호 재설정 이메일 (미설정 시 링크 직접 표시) |
| `RESEND_FROM_EMAIL` | ❌ | 발신 이메일 (`noreply@yourdomain.com`) |
| `GOOGLE_TRANSLATE_API_KEY` | ❌ | Google 번역 API (미설정 시 무료 대체 사용) |
| `LIBRETRANSLATE_URL` | ❌ | LibreTranslate 서버 URL |
| `LIBRETRANSLATE_API_KEY` | ❌ | LibreTranslate API 키 |

> `DIRECT_URL`은 Neon 사용 시 필수.
> 일반 단일 PostgreSQL 서버는 `DATABASE_URL`과 동일값 사용 가능.
