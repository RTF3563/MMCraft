# 모드 추가·삭제 결과 (2026-11-15 10:36 UTC)

### 테스트할 변경
- Sodium: mc26.3-0.9.2-fabric → mc26.3-0.9.3-beta.5-fabric
## ❌ 실행 테스트 실패 → 반영 안 함
- client: 게임이 중간에 종료됨 (코드 1)

```
    Mod resolution failed
    Immediate reason: [HARD_DEP betterblockentities 1.4.1+mc26.3 {depends sodium @ [>=0.9.3-beta.3]}, NEG_HARD_DEP sodium 0.9.3-beta.5+mc26.3 {breaks iris @ [<=1.12.0]}, ROOT_FORCELOAD_SINGLE betterblockentities 1.4.1+mc26.3, ROOT_FORCELOAD_SINGLE iris 1.11.7+mc26.3]
    Reason: [NEG_HARD_DEP sodium 0.9.3-beta.5+mc26.3 {breaks iris @ [<=1.12.0]}, NEG_HARD_DEP sodium 0.9.3-beta.5+mc26.3 {breaks moreculling @ [<1.9.2]}, HARD_DEP reeses-sodium-options 2.2.5+mc26.3 {depends sodium @ [=0.9.2+mc26.3]}, HARD_DEP sodium-extra 0.9.5+mc26.3 {depends sodium @ [0.9.2+mc26.3
    Fix: add [], remove [], replace [[reeses-sodium-options 2.2.5+mc26.3] -> add:reeses-sodium-options 1 ([(-∞,∞)]), [sodium 0.9.3-beta.5+mc26.3] -> add:sodium 0.9.3-beta.3 ([[0.9.3-beta.3,0.10-)]), [sodium-extra 0.9.5+mc26.3] -> add:sodium-extra 1 ([(-∞,∞)])]
    Incompatible mods found!
    net.fabricmc.loader.impl.FormattedException: Some of your mods are incompatible with the game or each other!
A potential solution has been determined, this may resolve your problem:
	 - Replace mod 'Reese's Sodium Options' (reeses-sodium-options) 2.2.5+mc26.3 with any version that is compatible with:
		 - sodium, any version between 0.9.3-beta.3 (inclusive) and 0.10- (exclusive)
		 - sodium-extra, any version
		 - sodium, any version between 0.9.3-beta.3 (inclusive) and 0.10- (exclusive)
	 - Replace mod 'Sodium' (sodium) 0.9.3-beta.5+mc26.3 with any version between 0.9.3-beta.3 (inclusive) and 0.10- (exclusive) that is compatible with:
		 - iris 1.11.7+mc26.3
		 - reeses-sodium-options, any version
		 - sodium-extra, any version
		 - moreculling 1.9.1
	 - Replace mod 'Sodium Extra' (sodium-extra) 0.9.5+mc26.3 with any version that is compatible with:
		 - sodium, any version between 0.9.3-beta.3 (inclusive) and 0.10- (exclusive)
		 - reeses-sodium-options, any version
More details:
	 - Mod 'Sodium' (sodium) 0.9.3-beta.5+mc26.3 is incompatible with version 1.12.0 or earlier of mod 'Iris' (iris), yet a conflicting version is present: 1.11.7+mc26.3!
	 - Mod 'Sodium' (sodium) 0.9.3-beta.5+mc26.3 is incompatible with any version before 1.9.2 of mod 'More Culling' (moreculling), yet a conflicting version is present: 1.9.1!
	 - Mod 'Reese's Sodium Options' (reeses-sodium-options) 2.2.5+mc26.3 requires version 0.9.2+mc26.3 of mod 'Sodium' (sodium), but only the wrong version is present: 0.9.3-beta.5+mc26.3!
	 - Mod 'Sodium Extra' (sodium-extra) 0.9.5+mc26.3 requires version 0.9.2+mc26.3 of mod 'Sodium' (sodium), but only the wrong version is present: 0.9.3-beta.5+mc26.3!
	at net.fabricmc.loader.impl.FormattedException.ofLocalized(FormattedException.java:51)
	at net.fabricmc.loader.impl.FabricLoaderImpl.load(FabricLoaderImpl.java:207)
	at net.fabricmc.loader.impl.launch.knot.Knot.init(Knot.java:142)
	at net.fabricmc.loader.impl.launch.knot.Knot.launch(Knot.java:66)
	at net.fabricmc.loader.impl.launch.knot.KnotClient.main(KnotClient.java:23)
```
