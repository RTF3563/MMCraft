# 모드 추가·삭제 결과 (2026-11-15 10:39 UTC)

### 테스트할 변경
- Better Block Entities: 1.4.1+mc26.3 → 1.4.0+mc26.3
## ❌ 실행 테스트 실패 → 반영 안 함
- client: 게임이 중간에 종료됨 (코드 null)

```
    Error loading class: mezz/jei/fabric/platform/RenderHelper (java.lang.ClassNotFoundException: mezz/jei/fabric/platform/RenderHelper)
    @Mixin target mezz.jei.fabric.platform.RenderHelper was not found appleskin.jei.mixins.json:JEIRenderHelperMixin from mod appleskin
    Error loading class: com/simibubi/create/content/schematics/SchematicPrinter (java.lang.ClassNotFoundException: com/simibubi/create/content/schematics/SchematicPrinter)
    Error loading class: dev/zelo/renderscale/RenderScale (java.lang.ClassNotFoundException: dev/zelo/renderscale/RenderScale)
    Force-disabling mixin 'features.render.world.sky.LevelRendererMixin' as rule 'mixin.features.render.world.sky' (added by mods [iris]) disables it and children
    Loaded config for: structureessentials.json
    Searching for graphics cards...
    Could not find any graphics adapters! Probably the device is not on a bus we can probe, or there are no devices supporting 3D acceleration.
    Sodium has applied one or more workarounds to prevent crashes or other issues on your system: [NO_ERROR_CONTEXT_UNSUPPORTED]
    This is not necessarily an issue, but it may result in certain features or optimizations being disabled. You can sometimes fix these issues by upgrading your graphics driver.
    Initializing MixinExtras via com.llamalad7.mixinextras.service.MixinExtrasServiceImpl(version=0.5.5).
    307 Datafixer optimizations took 694 milliseconds
    ModernFix reached bootstrap stage (8.824 s after launch)
    Loaded config for: biomemusic.json
    Method overwrite conflict for getTemperature in modernfix-common.mixins.json:perf.remove_biome_temperature_cache.BiomeMixin from mod modernfix, previously written by net.caffeinemc.mods.lithium.mixin.world.temperature_cache.BiomeMixin. Skipping method.
    Loaded default options for extra-folder
WARNING: A terminally deprecated method in sun.misc.Unsafe has been called
WARNING: sun.misc.Unsafe::staticFieldBase has been called by me.decce.ixeris.core.util.ReflectionHelper (file:/home/runner/work/MMCraft/MMCraft/.ci-cache/runs/1794739205746-1/client/mods/Ixeris-4.6.11+26.3-fabric.jar)
WARNING: Please consider reporting this to the maintainers of class me.decce.ixeris.core.util.ReflectionHelper
WARNING: sun.misc.Unsafe::staticFieldBase will be removed in a future release
    Environment: Environment[discoveryUrl=https://discovery.minecraftservices.com/minecraft/client, name=PROD]
    Setting user: MMCraftCI
    Almanac initialized
    BaguetteLib loaded on Fabric!
    Mod proxy balm:permissions resolved as net.blay09.mods.balm.fabric.platform.compatibility.permissions.internal.FabricPermissionsAPIIntegration@3a36f05d
    Better Compatibility Checker starting
    Better Compatibility Checker setup
    biomemusic mod initialized
    Failed to fetch user properties
    com.mojang.authlib.exceptions.InvalidCredentialsException: Status: 401
	at knot//com.mojang.authlib.exceptions.MinecraftClientHttpException.toAuthenticationException(MinecraftClientHttpException.java:70)
	at knot//com.mojang.authlib.services.MinecraftServicesUserApiService.fetchProperties(MinecraftServicesUserApiService.java:168)
	at knot//net.minecraft.client.Minecraft.lambda$new$1(Minecraft.java:451)
	at java.base/java.util.concurrent.CompletableFuture$AsyncSupply.run(CompletableFuture.java:1789)
	at java.base/java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1090)
	at java.base/java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:614)
	at java.base/java.lang.Thread.run(Thread.java:1474)
Caused by: MinecraftClientHttpException[type=HTTP_ERROR, status=401, response=ErrorResponse[path=/player/attributes, error=null, errorMessage=null, details=null]]
	at knot//com.mojang.authlib.minecraft.client.MinecraftClient.buildHttpException(MinecraftClient.java:170)
	at knot//com.mojang.authlib.minecraft.client.MinecraftClient.readServiceResponse(MinecraftClient.java:147)
	at knot//com.mojang.authlib.minecraft.client.MinecraftClient.getWithEtag(MinecraftClient.java:81)
	at knot//com.mojang.authlib.minecraft.client.MinecraftClient.get(MinecraftClient.java:65)
	at knot//com.mojang.authlib.services.MinecraftServicesUserApiService.fetchProperties(MinecraftServicesUserApiService.java:118)
	... 5 more
    Loading Collective version 8.86.
    Loaded config for: cupboard.json
    Enabled 3 bug fixes: [MC-577, MC-90683, MC-237493]
    Successfully Debugify'd your game!
    Constructing components for easyanvils:common
    Dispatching loading event for config easyanvils-client.toml
    Method overwrite conflict for getGuiRenderState in resourcefulconfig.mixins.json:client.GuiGraphicsExtractorAccessor from mod resourcefulconfig, previously written by com.anthonyhilyard.iceberg.mixin.GuiGraphicsMixin. Skipping method.
    Constructing components for easymagic:common
    Dispatching loading event for config easymagic-client.toml
    Constructing components for easyshulkerboxes:common
    Constructing components for fastitemframes:common
    Dispatching loading event for config fastitemframes-client.toml
    Constructing components for iteminteractions:common
    Dispatching loading event for config iteminteractions-client.toml
    Initializing JamLib on Fabric
    [KONKRETE] Loading v1.11.1 in client-side mode on FABRIC!
    [KONKRETE] Server-side modules initialized and ready to use!
    LetMeDespawn initializing on Fabric (production)
    I am quite particular about the effects I choose to add :3
    Constructing components for puzzleslib:common
    Initializing Right Click Harvest on FABRIC
    [STDOUT]: Trinket mod is not installed. Skipping compatibility features...
    [STDOUT]: ModMenu is installed! Adding compatibility features...
    [STDOUT]: Simple Hud Enhanced Mod started.
    structureessentials mod initialized
    Constructing components for visualworkbench:common
    Dispatching loading event for config visualworkbench-client.toml
    [voicechat] Compatibility version 20
    [voicechat] Loading plugins
    [voicechat] Loaded 1 plugin(s)
    [voicechat] Initializing plugins
    Initializing Simple Voice Chat integration
    [voicechat] Initialized 1 plugin(s)
    [voicechat] Registering events for 'sound_physics_remastered'
    Loaded
    Building config cache from user defined config file...
```
