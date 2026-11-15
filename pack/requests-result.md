# 모드 추가·삭제 결과 (2026-11-15 10:33 UTC)

### 테스트할 변경
- Sodium: mc26.3-0.9.2-fabric → mc26.3-0.9.3-beta.5-fabric
## ❌ 실행 테스트 실패 → 반영 안 함
- client: <log4j:Message><![CDATA[Mod resolution failed]]></log4j:Message>

```
    Loading Minecraft 26.3 with Fabric Loader 0.20.1
    Mappings not present!
    Mod dev_isxander_sdl_sdl-backend-ffm uses the version release-3.4.14-7 which isn't compatible with Loader's extended semantic version format (Could not parse version number component 'release'!), SemVer is recommended for reliably evaluating dependencies and prioritizing newer version
    Mod dev_isxander_sdl_sdl-api uses the version release-3.4.14-7 which isn't compatible with Loader's extended semantic version format (Could not parse version number component 'release'!), SemVer is recommended for reliably evaluating dependencies and prioritizing newer version
    Dependencies overridden for minecraft, polytone
    Mod resolution failed
```
