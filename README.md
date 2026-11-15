# MMCraft 런처

MMCraft 모드팩 전용 Windows 런처 + 모드 자동 업데이트 시스템.

## 무엇을 하나
| 기능 | 방식 |
|---|---|
| 모드 자동 최신화 | 매일 새벽 GitHub Actions가 Modrinth에서 새 버전 확인 → **서버·클라이언트 실제 실행 테스트** → 통과한 것만 배포. 실패하면 원인 모드를 찾아 그 버전만 보류하고 나머지는 반영 |
| 마크 버전 업 (26.3 → 26.4 …) | 새 버전이 나와도 **모든 모드가 지원하고 테스트를 통과할 때만** 올림. 그 전까지는 지금 버전 유지 (`pack/upgrade-status.json`에 기다리는 모드 목록) |
| 월드 유지 | 런처는 `saves`를 건드리지 않음. 마크 버전이 오를 때는 **실행 전에 월드 자동 백업** (최근 5개 보관) |
| 설정 유지 | 플레이어가 바꾼 설정은 팩이 그 파일을 바꿀 때만 덮어씀 |
| 런처 자체 업데이트 | GitHub Releases에 새 버전이 올라오면 자동으로 받아 재시작 때 적용 |

## 폴더
- `pack/` 팩 원본: `pack.json`(버전·정책), `mods.json`(모드 목록, 자동 관리), `held.json`(문제 있어 보류한 버전), `changelog.json`, `overrides/`(config·리소스팩·셰이더)
- `src/core` 설치·실행·동기화 (런처와 자동 테스트가 같은 코드 사용)
- `src/ci` 자동 업데이트·테스트·배포
- `src/launcher` Electron 런처 (UI: `renderer/`)
- 플레이어 PC 데이터: `%APPDATA%\.mmcraft` (`game\saves` = 월드, `backups` = 월드 백업)

## 운영 (GitHub → Actions 탭)
| 작업 | 실행 |
|---|---|
| 처음 한 번: CurseForge 목록 → Modrinth로 옮기기 | **CurseForge 가져오기** → Run workflow. 결과: `pack/import/import-report.md` |
| 지금 바로 업데이트 확인 | **자동 업데이트** → Run workflow (평소엔 매일 자동) |
| 모드 추가·삭제 | **모드 추가·삭제** → Modrinth 주소/이름 입력 (테스트 통과 시 배포) |
| 설정 파일만 고쳐서 배포 | `pack/overrides` 수정 후 push → **팩 수정 배포** 자동 실행 |
| 런처 새 버전 | `package.json` version 올려서 push → **런처 배포** 자동 실행 |

**CurseForge 함께 확인** (`pack/curseforge.json`): Modrinth엔 표시 안 됐지만 CurseForge에 새 버전 지원으로 올라온 파일은 같은 파일을 Modrinth에서 받음. CurseForge에만 있는 모드는 CurseForge API 키가 있을 때 CurseForge에서 받음 → `docs/CurseForge-API-키.md`

호환 예외(`pack/compat.json`): Modrinth엔 옛 버전용으로만 표시됐지만 CurseForge 등에서 새 버전 지원이 확인된 모드 (예: MixinTrace Reborn 26.1용 파일을 26.3에서 사용). 실행 테스트를 통과해야 배포됨.

정책(`pack/pack.json` → `policy`)
- `minStability`: 정식 버전이 없을 때 허용할 단계 (`beta` 기본)
- `autoUpgradeMinecraft`: 마크 자동 버전 업 (`true`)
- `maxBisectTests`: 원인 모드 찾기 최대 테스트 수 (1회 5~8분)

> 자동 테스트용 서버를 띄울 때 Minecraft EULA(https://aka.ms/MinecraftEULA)에 동의한 것으로 처리합니다 (`eula=true`).

## 로그인
Mojang 승인이 필요합니다 → `docs/로그인-승인-신청.md`

## 개발
```
npm install
npm test          # 단위 테스트
npm start         # 런처 실행
npm run dist:win  # 설치 파일 (Windows)
```
글꼴: Galmuri11, Pretendard (SIL OFL 1.1, `renderer/fonts`).
