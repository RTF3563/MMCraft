# 모드 추가·삭제 결과 (2026-11-15 09:45 UTC)

### Sodium mc26.3-0.9.2-fabric (팩에 들어 있는 파일)
```
sodium 0.9.2+mc26.3 depends={"minecraft":"26.3.x","fabricloader":">=0.16.0","fabric-block-getter-api-v2":"*","fabric-rendering-fluids-v1":">=2.0.0","fabric-resource-loader-v0":"*"} breaks={"embeddium":"*","optifabric":"*","canvas":"*","vulkanmod":"*","optimalaim":"<2.0.0","sodium-blendingregistry":"*","ocrenderfix_sodium":"*","betterfpsdist":"<=1.21-4.5","bobby":"<5.2.4","chunksfadein":"<2.0.2-1.21.2","cull-less-leaves":"<=1.3.0","cullleaves":"<=3.4.0-fabric","custom_hud":"<3.4.2","farsight":"<=1.21-4.3","iceberg":"<1.2.7","iris":"<=1.11.2","movingelevators":"<=1.4.7","notenoughcrashes":"<4.4.8","noxesium":"<2.3.3","reeses-sodium-options":"<=2.2.0","fabric-api":"<0.145.1","sodium-extra":"<0.8.0","audio_engine_tweaks":"<1.2.12","sspb":"<6.0.0","moreculling":"<1.6.0-beta.2","simply-no-shading":"<7.6.2","betterend":"<=21.0.11","enchanteds_sodium_options":"<1.0.1"} provides=["indium"]
  fabric-api-base 2.0.6+fcdff87f02 depends={"fabricloader":">=0.19.3"}
  fabric-block-getter-api-v2 2.0.9+3434d6d902 depends={"fabricloader":">=0.19.3"}
  fabric-lifecycle-events-v1 4.1.9+ffef5f6702 depends={"fabricloader":">=0.19.3","fabric-api-base":"*"}
  fabric-renderer-api-v1 17.0.14+2ce735b802 depends={"fabricloader":">=0.19.3","minecraft":">=26.1-rc.2","fabric-api-base":"*","fabric-rendering-v1":"*","fabric-transitive-access-wideners-v1":"*"}
  fabric-rendering-fluids-v1 6.0.6+3434d6d902 depends={"fabricloader":">=0.19.3","fabric-api-base":"*"}
  fabric-rendering-v1 27.0.14+901a437c02 depends={"fabricloader":">=0.19.3","fabric-api-base":"*","fabric-lifecycle-events-v1":"*"}
  fabric-resource-loader-v0 3.3.26+4fc5413f02 depends={"fabricloader":">=0.19.3","fabric-resource-loader-v1":"*"}
  fabric-resource-loader-v1 3.0.4+fcdff87f02 depends={"fabricloader":">=0.19.3"}
  fabric-transitive-access-wideners-v1 8.1.16+52268a0e02 depends={"fabricloader":">=0.19.3"}
```
### 테스트할 변경
- Essential Mod: (새로) → 1.5.2
## ❌ 실행 테스트 실패 → 반영 안 함
- client: <log4j:Message><![CDATA[Mod resolution failed]]></log4j:Message>

```
    Loading Minecraft 26.3 with Fabric Loader 0.20.1
    Mappings not present!
    Mod dev_isxander_sdl_sdl-api uses the version release-3.4.14-7 which isn't compatible with Loader's extended semantic version format (Could not parse version number component 'release'!), SemVer is recommended for reliably evaluating dependencies and prioritizing newer version
    Mod dev_isxander_sdl_sdl-backend-ffm uses the version release-3.4.14-7 which isn't compatible with Loader's extended semantic version format (Could not parse version number component 'release'!), SemVer is recommended for reliably evaluating dependencies and prioritizing newer version
    Dependencies overridden for minecraft, polytone
    Mod resolution failed
    Immediate reason: [HARD_DEP_NO_CANDIDATE betterblockentities 1.4.1+mc26.3 {depends sodium @ [>=0.9.3-beta.3]}, ROOT_FORCELOAD_SINGLE betterblockentities 1.4.1+mc26.3]
    Reason: [HARD_DEP betterblockentities 1.4.1+mc26.3 {depends sodium @ [>=0.9.3-beta.3]}]
```
