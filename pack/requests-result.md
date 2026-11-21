# 모드 추가·삭제 결과 (2026-11-21 13:34 UTC)

### 테스트할 변경
- Packet Fixer: (새로) → 3.3.6
- Neruina - Ticking Entity Fixer: (새로) → 3.3.5
- Structure Layout Optimizer: (새로) → 1.1.5+26.3-fabric
- Krypton: (새로) → 0.3.2
- Alternate Current: (새로) → mc26.3-1.9.0
- Chunky: (새로) → 1.5.66
- ServerCore: (새로) → 1.5.21+26.3
- Fast Backups: (새로) → 0.35.0+26.3.0
- Configurable: (새로) → 3.5.3
- Resourceful Config: (새로) → 6.0.2
## ❌ 실행 테스트 실패 → 반영 안 함
- server: 게임이 중간에 종료됨 (코드 0)

```
[13:34:41] [main/WARN]: Error loading class: com/simibubi/create/content/schematics/SchematicPrinter (java.lang.ClassNotFoundException: com/simibubi/create/content/schematics/SchematicPrinter)
[13:34:42] [main/INFO]: Loaded config for: structureessentials.json
[13:34:42] [main/INFO]: Initializing MixinExtras via com.llamalad7.mixinextras.service.MixinExtrasServiceImpl(version=0.5.5).
[13:34:43] [main/INFO]: ModernFix reached bootstrap stage (4.720 s after launch)
[13:34:43] [main/INFO]: Loading Generated Config Loaders...
[13:34:43] [main/INFO]: Loaded 'neruina'
WARNING: A terminally deprecated method in sun.misc.Unsafe has been called
WARNING: sun.misc.Unsafe::objectFieldOffset has been called by org.joml.MemUtil$MemUtilUnsafe (file:/home/runner/work/MMCraft/MMCraft/.ci-cache/runs/1795268077926-1/server/libraries/org/joml/joml/1.10.9/joml-1.10.9.jar)
WARNING: Please consider reporting this to the maintainers of class org.joml.MemUtil$MemUtilUnsafe
WARNING: sun.misc.Unsafe::objectFieldOffset will be removed in a future release
[13:34:44] [main/WARN]: Method overwrite conflict for getTemperature in modernfix-common.mixins.json:perf.remove_biome_temperature_cache.BiomeMixin from mod modernfix, previously written by net.caffeinemc.mods.lithium.mixin.world.temperature_cache.BiomeMixin. Skipping method.
[13:34:47] [main/INFO]: Almanac initialized
[13:34:47] [main/INFO]: BaguetteLib loaded on Fabric!
[13:34:47] [main/INFO]: Mod proxy balm:permissions resolved as net.blay09.mods.balm.fabric.platform.compatibility.permissions.internal.FabricPermissionsAPIIntegration@4ddb7723
[13:34:47] [main/INFO]: Better Compatibility Checker starting
[13:34:47] [main/INFO]: Better Compatibility Checker setup
[13:34:47] [main/INFO]: biomemusic mod initialized
[13:34:47] [main/INFO]: Loading Collective version 8.87.
[13:34:47] [main/WARN]: @Redirect conflict. Skipping krypton.mixins.json:shared.network.pipeline.encryption.ServerLoginPacketListenerImplMixin from mod krypton->@Redirect::onKey$initializeVelocityCipher(ILjava/security/Key;)Ljavax/crypto/Cipher; with priority 1000, already redirected by e4mc.mixins.
[13:34:47] [main/WARN]: @Redirect conflict. Skipping krypton.mixins.json:shared.network.pipeline.encryption.ServerLoginPacketListenerImplMixin from mod krypton->@Redirect::onKey$initializeVelocityCipher(ILjava/security/Key;)Ljavax/crypto/Cipher; with priority 1000, already redirected by e4mc.mixins.
[13:34:47] [main/INFO]: Loaded config for: cupboard.json
[13:34:47] [main/INFO]: Enabled 0 bug fixes: []
[13:34:47] [main/INFO]: Successfully Debugify'd your game!
[13:34:47] [main/INFO]: Constructing components for easyanvils:common
[13:34:48] [main/INFO]: Constructing components for easymagic:common
[13:34:48] [main/INFO]: Constructing components for easyshulkerboxes:common
[13:34:48] [main/INFO]: Constructing components for fastitemframes:common
[13:34:48] [main/INFO]: Constructing components for iteminteractions:common
[13:34:48] [main/INFO]: Initializing JamLib on Fabric
[13:34:48] [main/INFO]: [KONKRETE] Loading v1.11.1 in server-side mode on FABRIC!
[13:34:48] [main/INFO]: [KONKRETE] Server-side modules initialized and ready to use!
[13:34:48] [main/INFO]: Compression will use libdeflate (Linux x86_64), encryption will use OpenSSL 3.x.x (Linux x86_64)
[13:34:48] [main/INFO]: LetMeDespawn initializing on Fabric (production)
[13:34:48] [main/INFO]: Packet Fixer 3.3.6 Fabric has been initialized!
[13:34:48] [main/INFO]: Constructing components for puzzleslib:common
[13:34:48] [main/INFO]: Initializing Right Click Harvest on FABRIC
[13:34:48] [main/INFO]: [ServerCore] Loaded V1.5.21+26.3!
[13:34:48] [main/INFO]: structureessentials mod initialized
[13:34:48] [main/INFO]: Constructing components for visualworkbench:common
[13:34:48] [main/INFO]: [voicechat] Compatibility version 20
[13:34:48] [main/INFO]: [voicechat] Loading plugins
[13:34:48] [main/INFO]: [voicechat] Loaded 1 plugin(s)
[13:34:48] [main/INFO]: [voicechat] Initializing plugins
[13:34:48] [main/INFO]: Initializing Simple Voice Chat integration
[13:34:48] [main/INFO]: [voicechat] Initialized 1 plugin(s)
[13:34:48] [main/INFO]: [voicechat] Registering events for 'sound_physics_remastered'
[13:34:48] [main/ERROR]: Failed to start the minecraft server
java.lang.RuntimeException: Could not execute entrypoint stage 'main' due to errors, provided by 'controlify' at 'dev.isxander.controlify.fabric.ControlifyBootstrap'!
	at net.fabricmc.loader.impl.FabricLoaderImpl.lambda$invokeEntrypoints$0(FabricLoaderImpl.java:418)
	at net.fabricmc.loader.impl.util.ExceptionUtil.gatherExceptions(ExceptionUtil.java:33)
	at net.fabricmc.loader.impl.FabricLoaderImpl.invokeEntrypoints(FabricLoaderImpl.java:416)
	at net.fabricmc.loader.impl.game.minecraft.Hooks.startServer(Hooks.java:63)
	at knot//net.minecraft.server.Main.main(Main.java:114)
	at net.fabricmc.loader.impl.game.minecraft.MinecraftGameProvider.launch(MinecraftGameProvider.java:517)
	at net.fabricmc.loader.impl.launch.knot.Knot.launch(Knot.java:72)
	at net.fabricmc.loader.impl.launch.knot.KnotServer.main(KnotServer.java:23)
	at net.fabricmc.loader.impl.launch.server.FabricServerLauncher.main(FabricServerLauncher.java:69)
	at net.fabricmc.installer.ServerLauncher.main(ServerLauncher.java:69)
Caused by: java.lang.BootstrapMethodError: java.lang.RuntimeException: Mixin transformation of net.minecraft.server.network.ServerLoginPacketListenerImpl failed
	at knot//dev.isxander.controlify.server.ControlifyHandshake.setupOnServer(ControlifyHandshake.java:32)
	at knot//dev.isxander.controlify.server.ControlifyServer.onInitialize(ControlifyServer.java:29)
	at knot//dev.isxander.controlify.fabric.ControlifyBootstrap.onInitialize(ControlifyBootstrap.java:34)
	at net.fabricmc.loader.impl.FabricLoaderImpl.invokeEntrypoints(FabricLoaderImpl.java:414)
	... 7 more
Caused by: java.lang.RuntimeException: Mixin transformation of net.minecraft.server.network.ServerLoginPacketListenerImpl failed
	at net.fabricmc.loader.impl.launch.knot.KnotClassDelegate.getPostMixinClassByteArray(KnotClassDelegate.java:441)
	at net.fabricmc.loader.impl.launch.knot.KnotClassDelegate.tryLoadClass(KnotClassDelegate.java:337)
	at net.fabricmc.loader.impl.launch.knot.KnotClassDelegate.loadClass(KnotClassDelegate.java:232)
	at net.fabricmc.loader.impl.launch.knot.KnotClassLoader.loadClass(KnotClassLoader.java:119)
	at java.base/java.lang.ClassLoader.loadClass(ClassLoader.java:490)
	... 11 more
Caused by: org.spongepowered.asm.mixin.transformer.throwables.MixinTransformerError: An unexpected critical error was encountered
	at org.spongepowered.asm.mixin.transformer.MixinProcessor.applyMixins(MixinProcessor.java:380)
	at org.spongepowered.asm.mixin.transformer.MixinTransformer.transformClass(MixinTransformer.java:237)
	at org.spongepowered.asm.mixin.transformer.MixinTransformer.transformClassBytes(MixinTransformer.java:202)
	at net.fabricmc.loader.impl.launch.knot.KnotClassDelegate.getPostMixinClassByteArray(KnotClassDelegate.java:436)
	... 15 more
Caused by: org.spongepowered.asm.mixin.injection.throwables.InjectionError: Critical injection failure: Redirector onKey$initializeVelocityCipher(ILjava/security/Key;)Ljavax/crypto/Cipher; in krypton.mixins.json:shared.network.pipeline.encryption.ServerLoginPacketListenerImplMixin from mod krypton f
	at org.spongepowered.asm.mixin.injection.struct.InjectionInfo.postInject(InjectionInfo.java:526)
	at org.spongepowered.asm.mixin.transformer.MixinTargetContext.applyInjections(MixinTargetContext.java:1482)
```
