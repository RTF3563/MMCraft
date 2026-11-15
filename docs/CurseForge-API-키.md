# CurseForge API 키 (선택)

**결론: 키가 없어도 CurseForge 지원 버전 정보는 확인합니다. 키는 "CurseForge에만 있는 모드"(예: Biome Music)를 받을 때만 필요합니다.**

| | 키 없음 | 키 있음 |
|---|---|---|
| CurseForge 지원 버전 확인 | ✅ (CFWidget 사용) | ✅ (공식 API, 더 정확) |
| Modrinth에 있는 모드를 CurseForge 정보로 보완 | ✅ | ✅ |
| CurseForge 전용 모드 설치 | ❌ 대기 | ✅ (제작자가 외부 배포를 허용한 모드만) |

## 받는 방법
1. https://console.curseforge.com 접속 → CurseForge 계정으로 로그인
2. API 키 신청 (용도: 개인 모드팩 MMCraft 전용 런처·업데이트 확인, 저장소 https://github.com/RTF3563/MMCraft). 심사는 보통 며칠
3. 발급된 키를 GitHub 저장소 → **Settings → Secrets and variables → Actions → Secrets 탭 → New repository secret**
   - Name: `CF_API_KEY`
   - Secret: 발급받은 키
4. Actions 탭 → **자동 업데이트** → Run workflow (또는 다음 날 새벽 자동)

키는 비밀이라 **Variables가 아니라 Secrets**에 넣어야 합니다.
