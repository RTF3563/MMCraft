# MMCraft 런처

MMCraft 모드팩 전용 Windows 런처 + 서버 런처 + 모드 자동 업데이트 시스템.

## 무엇을 하나
| 기능 | 방식 |
|---|---|
| 모드 자동 최신화 | 매일 새벽 GitHub Actions가 Modrinth에서 새 버전 확인 → **서버·클라이언트 실제 실행 테스트** → 통과한 것만 배포. 실패하면 원인 모드를 찾아 그 버전만 보류하고 나머지는 반영 |
| 마크 버전 업 (26.3 → 26.4 …) | 새 버전이 나와도 **모든 모드가 지원하고 테스트를 통과할 때만** 올림. 그 전까지는 지금 버전 유지 (`pack/upgrade-status.json`에 기다리는 모드 목록) |
| 월드 유지 | 런처는 `saves`를 건드리지 않음. 마크 버전이 오를 때는 **실행 전에 월드 자동 백업** (최근 5개 보관) |
| 설정 유지 | 플레이어가 바꾼 설정은 팩이 그 파일을 바꿀 때만 덮어씀 |
| 런처 자체 업데이트 | 런처를 켤 때마다(그리고 켜 둔 동안 30분마다) 확인 → 새 버전이 있으면 자동으로 받아 **스스로 재시작해서 적용** (게임 중이면 게임을 끈 뒤) |
| 언어 | 한국어 / English (설정 → 언어, 기본은 컴퓨터 언어를 따름. 설치 프로그램도 두 언어) |
| 팩 자동 업데이트 | 런처를 켜면 새 팩을 바로 확인하고 **플레이를 누르지 않아도 미리 받아 둠** (마크 버전 업이면 월드 백업 먼저) |

## 서버 런처 (MMCraft Server)
서버 전용 Windows PC에서 MMCraft 서버를 여는 창 있는 앱. 서버 PC에 플레이어 런처는 없어도 됩니다.
설치 파일: Releases의 `MMCraft-Server-Setup.exe` (사이트의 **서버 런처 다운로드** 버튼)

| 기능 | 방식 |
|---|---|
| 서버 모드 구성 | 팩 모드 중 **클라이언트 전용(서버 unsupported)·리소스팩 자동 제외**, 설정은 `config/`만. Fabric 서버·Java 자동 설치 (자동 테스트 서버와 같은 규칙) |
| 업데이트 감지 | 플레이어 런처와 같은 `pack-dist` index.json을 **5분마다** 확인 |
| 업데이트 흐름 | 서버를 켠 채로 새 파일 미리 받기 → 접속자에게 공지 + **30초 카운트다운** → `kick @a` (밴 아님, 사유: "서버 업데이트가 있습니다. MMCraft를 재실행하여 업데이트를 진행해 주세요.") → 정지 → **월드 백업** → 모드·설정 교체 → 자동 재시작. 접속자가 없으면 카운트다운 없이 바로 |
| 재시작 없는 업데이트 | 클라이언트 전용 모드·리소스팩만 바뀐 팩은 서버 쪽이 같으므로 재시작하지 않고 버전 기록만 바꿈 |
| 크래시 자동 재시작 | 크래시·알 수 없는 종료 → 5초 뒤 재시작. **10분 안에 3번**이면 멈추고 Windows 알림. 정지 버튼·`stop` 명령·게임 안 `/stop`은 재시작 안 함 |
| 월드 유지 | 월드는 건드리지 않음. 업데이트마다 `서버 폴더\backups`에 백업 (최근 5개) |
| 화면 | 콘솔 로그, 접속자 목록, 시작/정지/재시작, 명령어 입력창(↑↓ 기록), 메모리·포트·서버 폴더·Java 옵션 설정, 한국어/English |
| 처음 실행 | Minecraft EULA 동의 (`eula.txt`) |
| Windows 시작 시 자동 실행 | 설정에서 켜기 (**기본 꺼짐**). 켜면 Windows 로그인 때 런처가 뜨고 서버도 시작 |
| 서버 런처 자체 업데이트 | 플레이어 런처와 같은 Releases(`server.yml`)로 확인 → **접속자가 없을 때** 서버를 잠깐 끄고 업데이트 → 다시 켬 |

- 데이터: `%APPDATA%\.mmcraft-server` (Java·캐시·설정), 서버 폴더 기본값 `%APPDATA%\.mmcraft-server\server` (설정에서 바꿀 수 있음)
- 원래 쓰던 서버 폴더를 고르면 처음 설치 때 기존 mods는 `mods-before-mmcraft-<시각>`으로 옮기고 월드·server.properties는 그대로 씀. 그 뒤 직접 넣은 모드는 건드리지 않음
- 소스: `src/server-launcher` (화면 `renderer/`), 서버 설치 공용 코드 `src/core/server.ts`, 서버 관리(시작·크래시·업데이트 순서) `src/server-launcher/manager.ts`
- 런처 배포와 함께 나감: `package.json` version을 올리면 **런처 배포** 워크플로가 두 설치 파일을 같은 Releases에 올림

## 팩 버전 규칙
`<마크 버전>.<모드 추가·삭제>.<모드 업데이트>` (예: `26.3.0.0`)
- 마크 버전이 오르면 → `26.4.0.0`
- 모드(라이브러리 포함)가 추가·삭제되면 → `26.3.1.0` (뒷자리 0으로)
- 모드 버전만 바뀌거나 설정 파일만 바뀌면 → `26.3.0.1`

## 다운로드 사이트
https://mmcraft.dpdns.org/ (`site/`, GitHub Pages + 무료 도메인 DigitalPlat. 예전 주소 rtf3563.github.io/MMCraft 도 새 주소로 연결됨). 최신 런처 설치 파일·팩 정보·모드 목록을 자동으로 불러옴. `site/` 수정 후 push하면 다시 배포.

## 폴더
- `pack/` 팩 원본: `pack.json`(버전·정책), `mods.json`(모드 목록, 자동 관리), `held.json`(문제 있어 보류한 버전), `changelog.json`, `overrides/`(config·리소스팩·셰이더)
- `src/core` 설치·실행·동기화 (런처와 자동 테스트가 같은 코드 사용)
- `src/ci` 자동 업데이트·테스트·배포
- `src/launcher` Electron 런처 (UI: `renderer/`)
- `src/server-launcher` Electron 서버 런처 (UI: `renderer/`)
- 플레이어 PC 데이터: `%APPDATA%\.mmcraft` (`game\saves` = 월드, `backups` = 월드 백업)

## 운영 (GitHub → Actions 탭)
| 작업 | 실행 |
|---|---|
| 처음 한 번: CurseForge 목록 → Modrinth로 옮기기 | **CurseForge 가져오기** → Run workflow. 결과: `pack/import/import-report.md` |
| 지금 바로 업데이트 확인 | **자동 업데이트** → Run workflow (평소엔 매일 자동) |
| 모드 추가·삭제 | **모드 추가·삭제** → Modrinth/CurseForge 주소 입력, 또는 `pack/requests.json`에 적어 push (테스트 통과 시 배포, 처리 후 비워짐) |
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
npm run start:server  # 서버 런처 실행
npm run dist:win      # 런처 설치 파일 (Windows)
npm run dist:server   # 서버 런처 설치 파일 (Windows)
```
글꼴: Galmuri11, Pretendard (SIL OFL 1.1, `renderer/fonts`).
