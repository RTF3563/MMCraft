# 모드 추가·삭제 결과 (2026-11-15 10:51 UTC)

### 현재 팩 테스트: 통과 (done: 서버·클라이언트 모두 통과)
```
    Loading 234 mods:
	- crash_assistant 1.11.14
	   |-- fabric-crash-report-info-v1 1.0.7+fcdff87f5d
	   |-- fabric-renderer-api-v1 17.0.19+79385d0b5d
	   |-- fabric-renderer-indigo 9.1.27+b9d63e335d
    Launching CrashAssistantApp (CrashAssistant-fabric-26.2-26.3-1.11.14.jar)
    enable_entity_renderer_caching: true
    enable_sky_angle_caching_in_worldrenderer: true
    enable_block_entity_renderer_caching: true
    enable_debug_renderer_disable_if_not_needed: true
    CrashAssistantApp process successfully started.
    Reference map 'iris.refmap.json' for mixins.iris.fixes.maxfpscrash.json could not be read. If this is a development environment you can ignore this message
    Force-disabling mixin 'features.render.world.sky.LevelRendererMixin' as rule 'mixin.features.render.world.sky' (added by mods [iris]) disables it and children
    Sodium has applied one or more workarounds to prevent crashes or other issues on your system: [NO_ERROR_CONTEXT_UNSUPPORTED]
    Registering alt renderers via each collected entrypoint...
    Backend library: LWJGL version 3.4.3-snapshot
    Failed to create backend OpenGL
    com.mojang.renderpearl.api.device.BackendCreationException: Failed to create window for OpenGL context: Couldn't find matching GLX visual
	at knot//com.mojang.renderpearl.backend.opengl.GlDevice.<init>(GlDevice.java:83)
	at knot//com.mojang.renderpearl.backend.opengl.GlBackend.createDevice(GlBackend.java:68)
```
### 테스트할 변경
- Essential Mod: (새로) → 1.5.2
## ✅ 팩 0.1.4
- 새 모드: Essential Mod
- (CurseForge) Animatica Refabricated: CurseForge 기준 26.3 지원 확인 (0.6.2+26.3)
- (CurseForge) ModernFix-mVUS: CurseForge 기준 26.3 지원 확인 (5.27.20-build.2)
