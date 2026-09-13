# data/species.db 크기 — 사실 정리

조사일 2026-09-13. 조사만 했다 — VACUUM·git 기록 재작성·LFS 전환 모두 실행하지 않았다. 권고는 적지 않는다.

---

## 1. 지금 크기

### GitHub 기준 (docs.github.com "About large files on GitHub")

> "If you attempt to add or update a file that is larger than 50 MiB, you will receive a warning from Git."
> "GitHub blocks files larger than 100 MiB."
> "We recommend repositories remain small, ideally less than 1 GB, and less than 5 GB is strongly recommended."

2026-09-13 푸시 때 실제로 `File data/species.db is 58.72 MB; this is larger than GitHub's recommended maximum file size of 50.00 MB` 경고를 받았다(푸시는 성공).

### 파일

| 항목 | 크기 |
|---|---:|
| `data/species.db` | 61,575,168 B (58.7 MiB) |
| 추적 중인 다른 DB — `data/backups/species-2026-05-04-pre-phase1.db` (+ `-shm` 32 KB, `-wal` 0 B) | 2,351,104 B |
| HEAD 에서 추적 중인 파일 전체 | 75.7 MB |

### 저장소

| 항목 | 크기 | 비고 |
|---|---:|---|
| 작업 폴더 전체 | 2.6 GB | `node_modules` 577 MB · `.next` 200 MB · `data/` 1.4 GB(대부분 gitignore 된 `species.db.backup_*` 파일) |
| 로컬 `.git` | 242 MB | `git count-objects -vH`: loose 924개 238.63 MiB, pack 1개 950 KiB |
| GitHub 저장소 (API `size`) | 45,820 KB ≈ 44.7 MB | GitHub 가 계산한 값 |

### 기록 속 species.db

| 항목 | 값 |
|---|---:|
| species.db 를 바꾼 커밋 | 32 |
| 서로 다른 species.db 버전(blob) | 30 |
| 30개 버전 원본 크기 합 | 1,331.8 MB |
| 로컬 `.git` 에 압축 저장된 크기 합 | 220.4 MB (버전당 약 10 MB) |

로컬 `.git` 242 MB 중 대부분이 species.db 의 옛 버전들이다. 버전당 58.7 MB 가 약 10 MB 로 압축되는 것은 파일 안의 빈 페이지(4절) 때문이다.

## 2. Vercel 이 DB 를 읽는 방식

- **번들 포함** — `next.config.mjs` 의 `experimental.outputFileTracingIncludes` 가 `/api/**`, `/species/**`, `/extinct/**`, `/stats`, `/favorites`, `/`, `/sitemap.xml` 함수에 `./data/species.db` 를 넣는다. `better-sqlite3` 는 `serverComponentsExternalPackages`.
- **실행 시** — `lib/db.ts`:
  - `process.env.VERCEL` 이 있고 `data/species.db` 가 있으면, 처음 열 때 `/tmp/species.db` 로 복사한 뒤 그 사본을 연다(주석: "Vercel 은 /tmp 만 쓰기 가능"). WAL 은 쓰지 않는다.
  - 로컬은 `data/species.db` 를 직접 열고 WAL 모드.
  - 사이트가 DB 에 쓰는 것(AI 추천·회고 캐시, wikipedia 캐시)은 Vercel 에서는 `/tmp` 사본에만 남는다.
- **함수 크기 한도** (vercel.com/docs/functions/limitations):
  > "For Vercel Functions, the maximum uncompressed size is **250 MB** including layers"
  > "Large functions let you deploy uncompressed bundles up to **5 GB**." (Beta)

  species.db 58.7 MiB 가 DB 를 쓰는 함수 번들마다 들어간다. 2026-09-13 배포 3건(Preview 2 · Production 1)은 모두 빌드 성공.

### DB 파일 없이 배포할 수 있는 구조인가

- 현재 코드에는 DB 를 저장소 밖(원격 저장소·빌드 단계 다운로드 등)에서 가져오는 경로가 **없다**. `data/species.db` 가 저장소에 있어야 번들에 들어간다.
- 파일이 없을 때(코드 읽기로 확인, 실행하지 않음):
  - `lib/db.ts` 의 `RUNTIME_DB` 는 `VERCEL && existsSync(SOURCE_DB)` 가 거짓이라 `data/species.db` 경로 그대로가 되고, `new Database(...)` 가 그 경로에 새 파일을 만들려 한다.
  - 로컬이면 빈 파일이 생기고 `initSchema` 가 빈 테이블을 만든다 → 종 0개인 사이트.
  - Vercel 에서는 코드 주석대로 `/tmp` 외에는 쓸 수 없다면 파일 생성이 실패한다(확인하지 않음).

## 3. Git LFS 로 옮기면 달라지는 것

### Vercel (vercel.com/docs/project-configuration/git-settings)

> "If you have LFS objects in your repository, you can enable or disable support for them from the project settings. When support is enabled, Vercel will pull the LFS objects that are used in your repository."
> "You must redeploy your project after turning Git LFS on."

### GitHub 요금·한도 (docs.github.com Git LFS billing)

- GitHub Free 개인 계정: 저장 10 GiB, 대역폭 10 GiB.
- > "When you download a Git LFS file, the bandwidth you use is included in the repository owner's bandwidth usage."
  > "If GitHub Actions downloads a 500 MB file that is tracked with Git LFS, it will use 500 MB of the repository owner's bandwidth."
- 업로드는 대역폭에 들어가지 않는다.
- (문서 문장에서 따라 나오는 것) Vercel 이 빌드마다 LFS 객체를 받으면 그때마다 species.db 크기만큼이 저장소 주인 대역폭으로 잡힌다. Vercel 이 빌드 캐시로 재다운로드를 줄이는지는 확인하지 않았다.

### 이미 커밋된 버전 (docs.github.com "Moving a file in your repository to Git LFS")

> "if you have an existing file in your repository that needs to be tracked in Git LFS, you need to first remove it from your repository."
> "Remove the file from the repository's Git history using the `filter-repo` command." (또는 `git lfs migrate`)

- 즉 기록 속 30개 버전을 LFS 로 옮기거나 지우려면 **git 기록 재작성**이 필요하다(이번 작업에서 금지 — 하지 않음).
- 기록을 그대로 두고 앞으로의 버전만 LFS 로 넣으면, 옛 30개 버전(원본 1,331.8 MB)은 저장소에 그대로 남는다.
- git-lfs 가 없는 환경에서 clone 하면 DB 대신 작은 포인터 파일이 받아진다(Git LFS 일반 동작).

## 4. VACUUM 으로 줄일 여지 — 계산만

`PRAGMA` 와 `dbstat` 로 읽기만 했다.

| 항목 | 값 |
|---|---:|
| page_size | 4,096 B |
| page_count | 15,033 (= 61,575,168 B) |
| **freelist_count (빈 페이지)** | **9,523 (39,006,208 B ≈ 37.2 MiB, 파일의 63%)** |
| 사용 중 페이지 | 5,510 (22,568,960 B ≈ 21.5 MiB) |
| auto_vacuum | 0 (NONE) |
| journal_mode | wal |

- VACUUM 은 빈 페이지를 없애므로, 실행하면 파일은 사용 중 페이지 몫인 **약 21.5 MiB** 안팎이 된다(추정 — 실행하지 않음). 페이지 안의 남는 공간(dbstat `unused` 합 약 2.7 MiB)까지 정리되면 조금 더 작아질 수 있다.
- 빈 페이지가 많은 이유는 확인하지 않았다(auto_vacuum 이 꺼진 상태에서 예전 대량 삭제·재작성이 있었다면 이렇게 남는다).
- VACUUM 을 해도 git 기록 속 옛 버전들은 줄지 않는다. 새 버전 하나가 더 커밋될 뿐이다.

### 테이블·인덱스별 크기 (dbstat, 상위)

| 이름 | MB | 페이지 |
|---|---:|---:|
| species | 11.53 | 2,951 |
| threats | 1.29 | 329 |
| idx_species_scientific_name | 1.27 | 326 |
| tipping_points | 0.99 | 253 |
| habitats | 0.96 | 247 |
| sqlite_autoindex_species_1 | 0.91 | 233 |
| idx_species_data_source | 0.81 | 207 |
| idx_species_curated_category · idx_species_category | 0.46 · 0.46 | 119 · 119 |
| idx_species_class · idx_habitats_species · idx_species_region | 0.41 · 0.39 · 0.38 | 104 · 101 · 96 |
| conservation_actions | 0.27 | 69 |
| wikipedia_cache | 0.24 | 61 |

행 수: species 41,282 · threats 8,718 · habitats 12,917 · conservation_actions 5,191 · tipping_points 941 · wikipedia_cache 446.
