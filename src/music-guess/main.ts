import "./style.css";
import type { CreateTypes, Options as ConfettiOptions } from "canvas-confetti";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Music guess app container was not found.");
}

const root = app;

type AssetSource = "demo" | "upload";
type NoticeTone = "info" | "success" | "error";
type GamePhase = "setup" | "playing" | "reviewed";
type PictureKind = "uncategorized" | "chara" | "activity" | "raid";
type AssetBankTab = "picture" | "music";
type ActivityFilterMode = "all" | "uncategorized";
type AudioCueKey = "click" | "success" | "failure";
type AudioChannel = "round" | "preview" | AudioCueKey;

type ThemeConfig = {
  appColor: string;
  headingColor: string;
  mutedTextColor: string;
  softTextColor: string;
  buttonTextColor: string;
  ghostButtonColor: string;
  accentColor: string;
  panelTint: string;
  backgroundStart: string;
  backgroundEnd: string;
  backgroundImage: string;
  correctColor: string;
  wrongColor: string;
};

type ActivityAsset = {
  id: string;
  name: string;
  kind: PictureKind;
  src: string;
  placeholderSrc: string;
  source: AssetSource;
  persistMode: "inline" | "blob";
  storageKey?: string;
  mimeType?: string;
  isHydrated: boolean;
  isStored: boolean;
};

type MusicAsset = {
  id: string;
  name: string;
  src: string;
  source: AssetSource;
  persistMode: "inline" | "blob";
  activityIds: string[];
  storageKey?: string;
  mimeType?: string;
  isHydrated: boolean;
  isStored: boolean;
};

type GameConfig = {
  shellWidth: number;
  cardWidth: number;
  cardHeight: number;
  maxDecodedPictures: number;
  maxDecodedMusics: number;
};

type AudioClip = {
  src: string;
  mimeType: string;
};

type AudioCueConfig = {
  clip: AudioClip | null;
  volume: number;
};

type AudioConfig = Record<AudioCueKey, AudioCueConfig>;

type Notice = {
  tone: NoticeTone;
  text: string;
  progress?: {
    current: number;
    total?: number;
    indeterminate?: boolean;
  };
};

type SerializedActivity = {
  id: string;
  name: string;
  kind?: PictureKind;
  src?: string;
  file?: string;
  mimeType?: string;
  source: AssetSource;
  persistMode: "inline" | "blob";
};

type SerializedMusic = {
  id: string;
  name: string;
  src?: string;
  file?: string;
  mimeType?: string;
  source: AssetSource;
  persistMode: "inline" | "blob";
  activityIds: string[];
};

type SerializedAudioClip = {
  src?: string;
  file?: string;
  mimeType?: string;
  volume?: number;
};

type SerializedAudioConfig = Partial<Record<AudioCueKey, SerializedAudioClip | null>>;

type PersistedActivity = {
  id: string;
  name: string;
  kind?: PictureKind;
  source: AssetSource;
  persistMode: "inline" | "blob";
  src?: string;
  mimeType?: string;
  storageKey?: string;
};

type PersistedMusic = {
  id: string;
  name: string;
  source: AssetSource;
  persistMode: "inline" | "blob";
  src?: string;
  mimeType?: string;
  storageKey?: string;
  activityIds: string[];
};

type PersistedAudioClip = {
  src?: string;
  storageKey?: string;
  mimeType?: string;
  volume?: number;
};

type PersistedAudioConfig = Partial<Record<AudioCueKey, PersistedAudioClip | null>>;

type PersistedWorkspace = {
  version: 3;
  activities: PersistedActivity[];
  musics: PersistedMusic[];
  config: GameConfig;
  theme: ThemeConfig;
  themeBackgroundStorageKey?: string;
  themeBackgroundMimeType?: string;
  musicVolume?: number;
  audio?: PersistedAudioConfig;
};

type WorkspaceSnapshotRecord = {
  version: 2;
  workspace: PersistedWorkspace;
};

type SavedWorkspace = {
  version: 1;
  activities: SerializedActivity[];
  musics: SerializedMusic[];
  config: GameConfig;
  theme: ThemeConfig;
  musicVolume?: number;
  audio?: SerializedAudioConfig;
};

type ActiveRound = {
  activities: ActivityAsset[];
  music: MusicAsset;
  correctActivityIds: string[];
};

type PagerState = {
  page: number;
  pageSize: number;
};

const STORAGE_KEY = "bagame.music-guess-workspace.v1";
const WORKSPACE_DB_NAME = "bagame-workspaces";
const WORKSPACE_DB_VERSION = 2;
const WORKSPACE_STORE_NAME = "workspaceSnapshots";
const WORKSPACE_ASSET_STORE_NAME = "workspaceAssets";
const WORKSPACE_RECORD_KEY = "music-guess";
const DEFAULT_PAGE_SIZE = 8;
const WORKSPACE_PERSIST_DELAY_MS = 120;
const AUDIO_CUE_KEYS: AudioCueKey[] = ["click", "success", "failure"];
const RECENT_ANSWER_HISTORY_LIMIT = 5;
const RECENT_ANSWER_REROLL_LIMIT = 5;

const DEFAULT_CONFIG: GameConfig = {
  shellWidth: 1380,
  cardWidth: 208,
  cardHeight: 208,
  maxDecodedPictures: 8,
  maxDecodedMusics: 8,
};

const DEFAULT_THEME: ThemeConfig = {
  appColor: "#edf4ff",
  headingColor: "#ffffff",
  mutedTextColor: "#9db2ce",
  softTextColor: "#bad0ea",
  buttonTextColor: "#082032",
  ghostButtonColor: "#1e293b",
  accentColor: "#7dd3fc",
  panelTint: "#0f172a",
  backgroundStart: "#06111f",
  backgroundEnd: "#111827",
  backgroundImage: "",
  correctColor: "#4ade80",
  wrongColor: "#f87171",
};

const DEFAULT_MUSIC_VOLUME = 0.8;

const state = {
  activities: [] as ActivityAsset[],
  musics: [] as MusicAsset[],
  config: { ...DEFAULT_CONFIG },
  theme: { ...DEFAULT_THEME },
  themeBackgroundStorageKey: null as string | null,
  themeBackgroundMimeType: null as string | null,
  themeBackgroundStored: false,
  musicVolume: DEFAULT_MUSIC_VOLUME,
  audio: {} as AudioConfig,
  phase: "setup" as GamePhase,
  isWorkbenchOpen: false,
  assetBankTab: "picture" as AssetBankTab,
  round: null as ActiveRound | null,
  selectedPlayKind: "activity" as PictureKind,
  activityFilterMode: "all" as ActivityFilterMode,
  selectedActivityId: null as string | null,
  linkingActivityId: null as string | null,
  activitySearchQuery: "",
  musicSearchQuery: "",
  musicManagerSearchQuery: "",
  pagers: {
    picture: { page: 1, pageSize: DEFAULT_PAGE_SIZE },
    music: { page: 1, pageSize: DEFAULT_PAGE_SIZE },
    "music-manager-linked": { page: 1, pageSize: DEFAULT_PAGE_SIZE },
    "music-manager-unlinked": { page: 1, pageSize: DEFAULT_PAGE_SIZE },
  } as Record<"picture" | "music" | "music-manager-linked" | "music-manager-unlinked", PagerState>,
  isAudioPlaying: false,
  previewMusicId: null as string | null,
  recentAnswerMusicIds: [] as string[],
  hydratedActivityIds: [] as string[],
  hydratedMusicIds: [] as string[],
  notice: {
    tone: "info",
    text: "已加载演示角色图、活动图、总力战图和音乐。你可以直接开始，也可以先在工作台替换素材。",
  } as Notice,
};

const activeSoundPlayers = new Set<HTMLAudioElement>();
const activeAudioByChannel = new Map<AudioChannel, HTMLAudioElement>();
let audioUnlocked = false;
let pendingWorkspacePersistTimer: number | null = null;
let confettiLauncher: CreateTypes | null = null;
let confettiLoadPromise: Promise<CreateTypes | null> | null = null;
const pendingActivityHydrations = new Map<string, Promise<void>>();
const pendingMusicHydrations = new Map<string, Promise<void>>();

function createDefaultAudioConfig(): AudioConfig {
  return {
    click: {
      clip: {
        src: createEffectWavDataUrl("click"),
        mimeType: "audio/wav",
      },
      volume: 0.55,
    },
    success: {
      clip: {
        src: createEffectWavDataUrl("success"),
        mimeType: "audio/wav",
      },
      volume: 0.75,
    },
    failure: {
      clip: {
        src: createEffectWavDataUrl("failure"),
        mimeType: "audio/wav",
      },
      volume: 0.72,
    },
  };
}

state.audio = createDefaultAudioConfig();

function getAudioCueLabel(cue: AudioCueKey): { title: string; description: string } {
  switch (cue) {
    case "click":
      return {
        title: "点击音效",
        description: "点击四张图片和右下角三个圆形按钮时播放",
      };
    case "success":
      return {
        title: "成功音效",
        description: "提交正确答案时播放，不打断当前挑战音乐",
      };
    case "failure":
      return {
        title: "失败音效",
        description: "提交错误答案时播放，不打断当前挑战音乐",
      };
  }
}

function clearAudioChannelState(channel: AudioChannel): void {
  if (channel === "round") {
    state.isAudioPlaying = false;
    return;
  }

  if (channel === "preview") {
    state.previewMusicId = null;
  }

}

function resolveAudioSource(src: string): string {
  try {
    return new URL(src, window.location.href).href;
  } catch {
    return src;
  }
}

function getAudioChannelGroup(channel: AudioChannel): AudioChannel[] {
  switch (channel) {
    case "round":
    case "preview":
      return ["round", "preview"];
    case "click":
    case "success":
    case "failure":
      return [channel];
  }
}

function releaseManagedAudio(channel: AudioChannel, audioElement: HTMLAudioElement): void {
  activeSoundPlayers.delete(audioElement);
  if (activeAudioByChannel.get(channel) === audioElement) {
    activeAudioByChannel.delete(channel);
  }
}

function stopAudioChannel(channel: AudioChannel): void {
  getAudioChannelGroup(channel).forEach((groupChannel) => {
    const audioElement = activeAudioByChannel.get(groupChannel);
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      releaseManagedAudio(groupChannel, audioElement);
    }
    clearAudioChannelState(groupChannel);
  });
}

function stopAllManagedAudio(): void {
  activeAudioByChannel.forEach((audioElement, channel) => {
    audioElement.pause();
    audioElement.currentTime = 0;
    releaseManagedAudio(channel, audioElement);
    clearAudioChannelState(channel);
  });
}

async function unlockAudioPlayback(): Promise<void> {
  if (audioUnlocked) {
    return;
  }

  try {
    const audioElement = new Audio();
    audioElement.muted = true;
    audioElement.playsInline = true;
    audioElement.preload = "auto";
    await audioElement.play().catch(() => undefined);
    audioElement.pause();
    audioUnlocked = true;
  } catch {
    // Ignore unlock failure; we'll retry on the next user gesture.
  }
}

async function playAudioChannel(
  channel: AudioChannel,
  src: string,
  options?: { restart?: boolean; volume?: number },
): Promise<HTMLAudioElement> {
  if (!audioUnlocked) {
    void unlockAudioPlayback();
  }

  const expectedSrc = resolveAudioSource(src);
  const currentAudio = activeAudioByChannel.get(channel);

  if (currentAudio && resolveAudioSource(currentAudio.currentSrc || currentAudio.src) === expectedSrc) {
    currentAudio.volume = clamp(options?.volume ?? currentAudio.volume, 0, 1);
    if (options?.restart) {
      currentAudio.currentTime = 0;
    }
    await currentAudio.play();
    return currentAudio;
  }

  stopAudioChannel(channel);

  const audioElement = new Audio(src);
  audioElement.preload = "auto";
  audioElement.playsInline = true;
  audioElement.volume = clamp(options?.volume ?? 1, 0, 1);
  activeSoundPlayers.add(audioElement);
  activeAudioByChannel.set(channel, audioElement);

  const cleanup = () => {
    releaseManagedAudio(channel, audioElement);
    clearAudioChannelState(channel);
    audioElement.removeEventListener("ended", cleanup);
    audioElement.removeEventListener("error", cleanup);
    render();
  };

  audioElement.addEventListener("ended", cleanup);
  audioElement.addEventListener("error", cleanup);

  try {
    await audioElement.play();
    return audioElement;
  } catch (error) {
    cleanup();
    throw error;
  }
}

function getPictureKindLabel(kind: PictureKind): string {
  switch (kind) {
    case "uncategorized":
      return "未分类";
    case "activity":
      return "活动图";
    case "chara":
      return "角色图";
    case "raid":
      return "总力战图";
  }
}

async function loadConfettiLauncher(): Promise<CreateTypes | null> {
  if (confettiLauncher) {
    return confettiLauncher;
  }

  if (!confettiLoadPromise) {
    confettiLoadPromise = import("canvas-confetti")
      .then((module) => {
        confettiLauncher = module.default.create(undefined, {
          resize: true,
          useWorker: true,
          disableForReducedMotion: true,
        });
        return confettiLauncher;
      })
      .catch(() => null);
  }

  return confettiLoadPromise;
}

async function launchSuccessConfetti(): Promise<void> {
  const launcher = await loadConfettiLauncher();
  if (!launcher) {
    return;
  }

  const burstOptions: ConfettiOptions = {
    particleCount: 260,
    spread: 118,
    startVelocity: 68,
    scalar: 1.7,
  };

  await Promise.all([
    launcher({
      ...burstOptions,
      origin: { x: 0.16, y: 0.72 },
    }),
    launcher({
      ...burstOptions,
      origin: { x: 0.84, y: 0.72 },
    }),
    launcher({
      ...burstOptions,
      particleCount: 220,
      spread: 132,
      startVelocity: 74,
      scalar: 1.9,
      origin: { x: 0.5, y: 0.36 },
    }),
  ]);
}

function openWorkspaceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WORKSPACE_DB_NAME, WORKSPACE_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(WORKSPACE_STORE_NAME)) {
        database.createObjectStore(WORKSPACE_STORE_NAME);
      }
      if (!database.objectStoreNames.contains(WORKSPACE_ASSET_STORE_NAME)) {
        database.createObjectStore(WORKSPACE_ASSET_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open workspace database."));
  });
}

function createAssetStorageKey(kind: string, id: string): string {
  return `${WORKSPACE_RECORD_KEY}:${kind}:${id}`;
}

function readBlobFromIndexedDb(storageKey: string): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    openWorkspaceDatabase()
      .then((database) => {
        const transaction = database.transaction(WORKSPACE_ASSET_STORE_NAME, "readonly");
        const store = transaction.objectStore(WORKSPACE_ASSET_STORE_NAME);
        const request = store.get(storageKey);

        request.onsuccess = () => {
          resolve((request.result as Blob | undefined) ?? null);
          database.close();
        };
        request.onerror = () => {
          reject(request.error ?? new Error("Failed to read asset blob."));
          database.close();
        };
      })
      .catch(reject);
  });
}

function deleteBlobFromIndexedDb(store: IDBObjectStore, storageKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.delete(storageKey);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to delete asset blob."));
  });
}

function putBlobToIndexedDb(store: IDBObjectStore, storageKey: string, blob: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.put(blob, storageKey);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Failed to write asset blob."));
  });
}

function readWorkspaceFromIndexedDb(): Promise<SavedWorkspace | PersistedWorkspace | null> {
  return new Promise((resolve, reject) => {
    openWorkspaceDatabase()
      .then((database) => {
        const transaction = database.transaction(WORKSPACE_STORE_NAME, "readonly");
        const store = transaction.objectStore(WORKSPACE_STORE_NAME);
        const request = store.get(WORKSPACE_RECORD_KEY);

        request.onsuccess = async () => {
          try {
            const result = request.result as SavedWorkspace | WorkspaceSnapshotRecord | undefined;
            if (!result) {
              resolve(null);
              database.close();
              return;
            }

            if ("version" in result && result.version === 2 && "workspace" in result) {
              resolve(result.workspace);
            } else {
              resolve(result as SavedWorkspace);
            }
          } catch (error) {
            reject(error);
          } finally {
            database.close();
          }
        };
        request.onerror = () => {
          reject(request.error ?? new Error("Failed to read workspace data."));
          database.close();
        };
      })
      .catch(reject);
  });
}

async function createPersistedWorkspaceSnapshot(payload: SavedWorkspace): Promise<PersistedWorkspace> {
  const activities: PersistedActivity[] = await Promise.all(
    payload.activities.map(async (activity) => {
      if (activity.src && activity.src.startsWith("data:")) {
        const blob = dataUrlToBlob(activity.src);
        return {
          id: activity.id,
          name: activity.name,
          kind: activity.kind,
          source: activity.source,
          persistMode: "blob",
          mimeType: blob.type,
          storageKey: createAssetStorageKey("activity", activity.id),
        };
      }

      return {
        id: activity.id,
        name: activity.name,
        kind: activity.kind,
        source: activity.source,
        persistMode: "inline",
        src: activity.src,
      };
    }),
  );

  const musics: PersistedMusic[] = await Promise.all(
    payload.musics.map(async (music) => {
      if (music.src && music.src.startsWith("data:")) {
        const blob = dataUrlToBlob(music.src);
        return {
          id: music.id,
          name: music.name,
          source: music.source,
          persistMode: "blob",
          mimeType: blob.type,
          storageKey: createAssetStorageKey("music", music.id),
          activityIds: [...music.activityIds],
        };
      }

      return {
        id: music.id,
        name: music.name,
        source: music.source,
        persistMode: "inline",
        src: music.src,
        activityIds: [...music.activityIds],
      };
    }),
  );

  const audio: PersistedAudioConfig | undefined = payload.audio
    ? Object.fromEntries(
        Object.entries(payload.audio).map(([cue, clip]) => {
          if (!clip?.src) {
            return [cue, null];
          }

          if (clip.src.startsWith("data:")) {
            const blob = dataUrlToBlob(clip.src);
            return [
              cue,
              {
                storageKey: createAssetStorageKey("audio", cue),
                mimeType: blob.type,
                volume: clip.volume,
              },
            ];
          }

          return [
            cue,
            {
              src: clip.src,
              mimeType: clip.mimeType,
              volume: clip.volume,
            },
          ];
        }),
      ) as PersistedAudioConfig
    : undefined;

  const themeBackgroundIsDataUrl = !!payload.theme.backgroundImage && payload.theme.backgroundImage.startsWith("data:");

  return {
    version: 3,
    activities,
    musics,
    config: { ...payload.config },
    musicVolume: payload.musicVolume,
    theme: {
      ...payload.theme,
      backgroundImage: themeBackgroundIsDataUrl ? "" : payload.theme.backgroundImage,
    },
    themeBackgroundStorageKey: themeBackgroundIsDataUrl ? createAssetStorageKey("theme", "background") : undefined,
    themeBackgroundMimeType: themeBackgroundIsDataUrl ? dataUrlToBlob(payload.theme.backgroundImage).type : undefined,
    audio,
  };
}

async function createPersistedWorkspaceSnapshotFromState(): Promise<PersistedWorkspace> {
  const activities: PersistedActivity[] = await Promise.all(
    state.activities.map(async (activity) => {
      if (activity.storageKey) {
        return {
          id: activity.id,
          name: activity.name,
          kind: activity.kind,
          source: activity.source,
          persistMode: "blob",
          mimeType: activity.mimeType,
          storageKey: activity.storageKey,
        };
      }

      if (activity.persistMode === "blob") {
        const blob = await fetch(activity.src).then((response) => response.blob());
        return {
          id: activity.id,
          name: activity.name,
          kind: activity.kind,
          source: activity.source,
          persistMode: "blob",
          mimeType: blob.type,
          storageKey: createAssetStorageKey("activity", activity.id),
        };
      }

      return {
        id: activity.id,
        name: activity.name,
        kind: activity.kind,
        source: activity.source,
        persistMode: "inline",
        src: activity.src,
      };
    }),
  );

  const musics: PersistedMusic[] = await Promise.all(
    state.musics.map(async (music) => {
      if (music.storageKey) {
        return {
          id: music.id,
          name: music.name,
          source: music.source,
          persistMode: "blob",
          mimeType: music.mimeType,
          storageKey: music.storageKey,
          activityIds: [...music.activityIds],
        };
      }

      if (music.persistMode === "blob") {
        const blob = await fetch(music.src).then((response) => response.blob());
        return {
          id: music.id,
          name: music.name,
          source: music.source,
          persistMode: "blob",
          mimeType: blob.type,
          storageKey: createAssetStorageKey("music", music.id),
          activityIds: [...music.activityIds],
        };
      }

      return {
        id: music.id,
        name: music.name,
        source: music.source,
        persistMode: "inline",
        src: music.src,
        activityIds: [...music.activityIds],
      };
    }),
  );

  const audio = await serializeAudioConfig(state.audio);
  const persistedAudio: PersistedAudioConfig | undefined = audio
    ? Object.fromEntries(
        Object.entries(audio).map(([cue, clip]) => {
          if (!clip?.src) {
            return [cue, null];
          }

          if (clip.src.startsWith("data:")) {
            return [
              cue,
              {
                storageKey: createAssetStorageKey("audio", cue),
                mimeType: clip.mimeType,
                volume: clip.volume,
              },
            ];
          }

          return [cue, clip];
        }),
      ) as PersistedAudioConfig
    : undefined;

  return {
    version: 3,
    activities,
    musics,
    config: { ...state.config },
    musicVolume: state.musicVolume,
    theme: {
      ...state.theme,
      backgroundImage: state.themeBackgroundStored ? "" : state.theme.backgroundImage,
    },
    themeBackgroundStorageKey: state.themeBackgroundStored ? state.themeBackgroundStorageKey ?? undefined : undefined,
    themeBackgroundMimeType: state.themeBackgroundStored ? state.themeBackgroundMimeType ?? undefined : undefined,
    audio: persistedAudio,
  };
}

async function writeWorkspaceToIndexedDb(payload: SavedWorkspace): Promise<void> {
  const persistedWorkspace = await createPersistedWorkspaceSnapshot(payload);
  return writePersistedWorkspaceSnapshotToIndexedDb(
    persistedWorkspace,
    payload.activities.map((activity) => ({
      storageKey: createAssetStorageKey("activity", activity.id),
      src: activity.src,
    })),
    payload.musics.map((music) => ({
      storageKey: createAssetStorageKey("music", music.id),
      src: music.src,
    })),
    payload.theme.backgroundImage
      ? [{ storageKey: createAssetStorageKey("theme", "background"), src: payload.theme.backgroundImage }]
      : [],
    AUDIO_CUE_KEYS.map((cue) => ({
      storageKey: createAssetStorageKey("audio", cue),
      src: payload.audio?.[cue]?.src ?? "",
    })),
  );
}

async function writePersistedWorkspaceSnapshotToIndexedDb(
  persistedWorkspace: PersistedWorkspace,
  activityAssets: Array<{ storageKey: string; src?: string }>,
  musicAssets: Array<{ storageKey: string; src?: string }>,
  themeAssets: Array<{ storageKey: string; src?: string }>,
  audioAssets: Array<{ storageKey: string; src?: string }>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    openWorkspaceDatabase()
      .then((database) => {
        const transaction = database.transaction([WORKSPACE_STORE_NAME, WORKSPACE_ASSET_STORE_NAME], "readwrite");
        const workspaceStore = transaction.objectStore(WORKSPACE_STORE_NAME);
        const assetStore = transaction.objectStore(WORKSPACE_ASSET_STORE_NAME);
        const snapshotRecord: WorkspaceSnapshotRecord = {
          version: 2,
          workspace: persistedWorkspace,
        };
        const request = workspaceStore.put(snapshotRecord, WORKSPACE_RECORD_KEY);

        const writes: Promise<void>[] = [];
        activityAssets.forEach((activity) => {
          if (activity.src?.startsWith("data:")) {
            writes.push(putBlobToIndexedDb(assetStore, activity.storageKey, dataUrlToBlob(activity.src)));
          }
        });
        musicAssets.forEach((music) => {
          if (music.src?.startsWith("data:")) {
            writes.push(putBlobToIndexedDb(assetStore, music.storageKey, dataUrlToBlob(music.src)));
          }
        });
        themeAssets.forEach((themeAsset) => {
          if (themeAsset.src?.startsWith("data:")) {
            writes.push(putBlobToIndexedDb(assetStore, themeAsset.storageKey, dataUrlToBlob(themeAsset.src)));
          }
        });
        audioAssets.forEach((audioAsset) => {
          if (audioAsset.src?.startsWith("data:")) {
            writes.push(putBlobToIndexedDb(assetStore, audioAsset.storageKey, dataUrlToBlob(audioAsset.src)));
          }
        });

        Promise.all(writes).catch(reject);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error("Failed to write workspace data."));
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => database.close();
        transaction.onabort = () => database.close();
      })
      .catch(reject);
  });
}

function setNotice(
  tone: NoticeTone,
  text: string,
  progress?: {
    current: number;
    total?: number;
    indeterminate?: boolean;
  },
): void {
  state.notice = { tone, text, progress };
}

function syncNotice(): void {
  const notice = root.querySelector<HTMLElement>("[data-notice]");
  if (!notice) {
    return;
  }

  const progress = state.notice.progress;
  const percent =
    progress && !progress.indeterminate && progress.total && progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : null;

  notice.className = `notice notice-${state.notice.tone}`;
  notice.innerHTML = `
    <div class="notice-copy">
      <div class="notice-content">
        <p>${state.notice.text}</p>
        ${
          progress
            ? `
              <div class="notice-progress">
                <div class="notice-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" ${percent !== null ? `aria-valuenow="${percent}"` : ""}>
                  <span style="width: ${percent ?? 100}%"></span>
                </div>
                <small>${
                  progress.indeterminate || !progress.total
                    ? `已处理 ${progress.current} 项`
                    : `${percent ?? 0}% · ${progress.current} / ${progress.total}`
                }</small>
              </div>
            `
            : ""
        }
      </div>
    </div>
  `;
}

function normalizePagerPage(totalItems: number, pageSize: number, page: number): number {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return clamp(page, 1, totalPages);
}

function paginateItems<T>(items: T[], pager: PagerState): { items: T[]; totalPages: number; page: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pager.pageSize));
  const page = normalizePagerPage(items.length, pager.pageSize, pager.page);
  const start = (page - 1) * pager.pageSize;

  return {
    items: items.slice(start, start + pager.pageSize),
    totalPages,
    page,
  };
}

function renderPagination(
  pagerKey: "picture" | "music" | "music-manager-linked" | "music-manager-unlinked",
  totalItems: number,
): string {
  const pager = state.pagers[pagerKey];
  const totalPages = Math.max(1, Math.ceil(totalItems / pager.pageSize));
  const currentPage = normalizePagerPage(totalItems, pager.pageSize, pager.page);

  if (totalItems <= pager.pageSize) {
    return "";
  }

  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((page) => {
      if (totalPages <= 7) {
        return true;
      }

      return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
    });

  return `
    <div class="pager-bar">
      <button class="ghost-button compact-action" type="button" data-page-nav="${pagerKey}" data-page-target="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>
        上一页
      </button>
      <div class="pager-numbers">
        ${pageNumbers
          .map((page, index) => {
            const previous = pageNumbers[index - 1];
            const gap = previous && page - previous > 1 ? `<span class="pager-ellipsis">...</span>` : "";
            return `${gap}
              <button class="${page === currentPage ? "primary-button" : "ghost-button"} compact-action" type="button" data-page-nav="${pagerKey}" data-page-target="${page}" aria-current="${page === currentPage ? "page" : "false"}">
                ${page}
              </button>
            `;
          })
          .join("")}
      </div>
      <span class="pager-copy">第 ${currentPage} / ${totalPages} 页，共 ${totalItems} 项</span>
      <button class="ghost-button compact-action" type="button" data-page-nav="${pagerKey}" data-page-target="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""}>
        下一页
      </button>
    </div>
  `;
}

function movePagerToLastPage(
  pagerKey: "picture" | "music" | "music-manager-linked" | "music-manager-unlinked",
  totalItems: number,
): void {
  state.pagers[pagerKey].page = Math.max(1, Math.ceil(totalItems / state.pagers[pagerKey].pageSize));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeCardDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.round(value));
}

function shuffle<T>(items: T[]): T[] {
  const clone = [...items];
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
  }
  return clone;
}

function sampleMany<T>(items: T[], count: number): T[] {
  return shuffle(items).slice(0, count);
}

function countMusicMatchesInActivities(music: MusicAsset, activityIds: Set<string>): number {
  return music.activityIds.filter((activityId) => activityIds.has(activityId)).length;
}

function blobToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert blob to data URL."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, content] = dataUrl.split(",");
  const mimeMatch = meta.match(/data:([^;]+)/);
  const mimeType = mimeMatch?.[1] ?? "application/octet-stream";
  const isBase64 = meta.includes(";base64");

  if (isBase64) {
    const bytes = atob(content);
    const array = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) {
      array[index] = bytes.charCodeAt(index);
    }
    return new Blob([array], { type: mimeType });
  }

  return new Blob([decodeURIComponent(content)], { type: mimeType });
}

function ensureObjectUrl(value: string): { src: string; persistMode: "inline" | "blob" } {
  if (value.startsWith("data:")) {
    return {
      src: URL.createObjectURL(dataUrlToBlob(value)),
      persistMode: "blob",
    };
  }

  return {
    src: value,
    persistMode: "inline",
  };
}

function createRuntimeActivityAsset(activity: SerializedActivity | PersistedActivity): ActivityAsset {
  const kind = activity.kind ?? "uncategorized";
  const inlineSrc = activity.src ?? "";
  const assetView = inlineSrc ? ensureObjectUrl(inlineSrc) : null;

  return {
    id: activity.id,
    name: activity.name,
    kind,
    src: assetView?.src ?? createImagePlaceholder(activity.name, kind),
    placeholderSrc: createImagePlaceholder(activity.name, kind),
    source: activity.source,
    persistMode: assetView?.persistMode ?? activity.persistMode,
    storageKey: "storageKey" in activity ? activity.storageKey : undefined,
    mimeType: activity.mimeType,
    isHydrated: !!assetView,
    isStored: activity.persistMode === "blob" && !!("storageKey" in activity ? activity.storageKey : false),
  };
}

function createRuntimeMusicAsset(music: SerializedMusic | PersistedMusic): MusicAsset {
  const inlineSrc = music.src ?? "";
  const assetView = inlineSrc ? ensureObjectUrl(inlineSrc) : null;

  return {
    id: music.id,
    name: music.name,
    src: assetView?.src ?? "",
    source: music.source,
    persistMode: assetView?.persistMode ?? music.persistMode,
    activityIds: [...music.activityIds],
    storageKey: "storageKey" in music ? music.storageKey : undefined,
    mimeType: music.mimeType,
    isHydrated: !!assetView,
    isStored: music.persistMode === "blob" && !!("storageKey" in music ? music.storageKey : false),
  };
}

function rememberHydratedAsset(kind: "activity" | "music", id: string): void {
  const queue = kind === "activity" ? state.hydratedActivityIds : state.hydratedMusicIds;
  const nextQueue = [...queue.filter((itemId) => itemId !== id), id];
  if (kind === "activity") {
    state.hydratedActivityIds = nextQueue;
  } else {
    state.hydratedMusicIds = nextQueue;
  }
}

function forgetHydratedAsset(kind: "activity" | "music", id: string): void {
  if (kind === "activity") {
    state.hydratedActivityIds = state.hydratedActivityIds.filter((itemId) => itemId !== id);
  } else {
    state.hydratedMusicIds = state.hydratedMusicIds.filter((itemId) => itemId !== id);
  }
}

function releaseActivityHydration(activity: ActivityAsset): void {
  if (activity.persistMode === "blob" && activity.src.startsWith("blob:")) {
    URL.revokeObjectURL(activity.src);
  }
  activity.src = activity.placeholderSrc;
  activity.isHydrated = false;
  forgetHydratedAsset("activity", activity.id);
}

function releaseMusicHydration(music: MusicAsset): void {
  if (music.persistMode === "blob" && music.src.startsWith("blob:")) {
    URL.revokeObjectURL(music.src);
  }
  music.src = "";
  music.isHydrated = false;
  forgetHydratedAsset("music", music.id);
}

function getProtectedActivityIds(): Set<string> {
  return new Set(state.round?.activities.map((activity) => activity.id) ?? []);
}

function getProtectedMusicIds(): Set<string> {
  const protectedIds = new Set<string>();
  if (state.round?.music.id) {
    protectedIds.add(state.round.music.id);
  }
  if (state.phase === "reviewed" && state.round) {
    state.round.activities.forEach((activity) => {
      const reviewedMusic = getReviewedActivityMusic(activity.id);
      if (reviewedMusic) {
        protectedIds.add(reviewedMusic.id);
      }
    });
  }
  if (state.previewMusicId) {
    protectedIds.add(state.previewMusicId);
  }
  return protectedIds;
}

function enforceHydrationLimits(): void {
  const protectedActivityIds = getProtectedActivityIds();
  const protectedMusicIds = getProtectedMusicIds();

  while (state.hydratedActivityIds.length > state.config.maxDecodedPictures) {
    const releasableId = state.hydratedActivityIds.find((id) => !protectedActivityIds.has(id));
    if (!releasableId) {
      break;
    }
    const activity = state.activities.find((item) => item.id === releasableId);
    if (!activity) {
      forgetHydratedAsset("activity", releasableId);
      continue;
    }
    releaseActivityHydration(activity);
  }

  while (state.hydratedMusicIds.length > state.config.maxDecodedMusics) {
    const releasableId = state.hydratedMusicIds.find((id) => !protectedMusicIds.has(id));
    if (!releasableId) {
      break;
    }
    const music = state.musics.find((item) => item.id === releasableId);
    if (!music) {
      forgetHydratedAsset("music", releasableId);
      continue;
    }
    releaseMusicHydration(music);
  }
}

async function ensureActivityHydrated(activityId: string): Promise<void> {
  const activity = state.activities.find((item) => item.id === activityId);
  if (!activity || activity.isHydrated || !activity.storageKey) {
    return;
  }

  const pending = pendingActivityHydrations.get(activityId);
  if (pending) {
    await pending;
    return;
  }

  const hydration = (async () => {
    const blob = await readBlobFromIndexedDb(activity.storageKey!);
    if (!blob) {
      throw new Error(`Missing image blob for ${activity.name}`);
    }
    activity.src = URL.createObjectURL(blob);
    activity.persistMode = "blob";
    activity.isHydrated = true;
    rememberHydratedAsset("activity", activity.id);
    enforceHydrationLimits();
  })();

  pendingActivityHydrations.set(activityId, hydration);
  try {
    await hydration;
  } finally {
    pendingActivityHydrations.delete(activityId);
  }
}

async function ensureMusicHydrated(musicId: string): Promise<void> {
  const music = state.musics.find((item) => item.id === musicId);
  if (!music || music.isHydrated || !music.storageKey) {
    return;
  }

  const pending = pendingMusicHydrations.get(musicId);
  if (pending) {
    await pending;
    return;
  }

  const hydration = (async () => {
    const blob = await readBlobFromIndexedDb(music.storageKey!);
    if (!blob) {
      throw new Error(`Missing music blob for ${music.name}`);
    }
    music.src = URL.createObjectURL(blob);
    music.persistMode = "blob";
    music.isHydrated = true;
    rememberHydratedAsset("music", music.id);
    enforceHydrationLimits();
  })();

  pendingMusicHydrations.set(musicId, hydration);
  try {
    await hydration;
  } finally {
    pendingMusicHydrations.delete(musicId);
  }
}

async function ensureRoundAssetsReady(round: ActiveRound, options?: { includeReviewedPreviewMusic?: boolean }): Promise<void> {
  await Promise.all(round.activities.map((activity) => ensureActivityHydrated(activity.id)));

  const musicIds = new Set<string>([round.music.id]);
  if (options?.includeReviewedPreviewMusic) {
    round.activities.forEach((activity) => {
      const reviewedMusic = getReviewedActivityMusic(activity.id);
      if (reviewedMusic) {
        musicIds.add(reviewedMusic.id);
      }
    });
  }

  await Promise.all(Array.from(musicIds).map((musicId) => ensureMusicHydrated(musicId)));
}

function getFileExtensionFromMime(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("svg")) return "svg";
  if (mimeType.includes("mp3") || mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  return "bin";
}

function releaseThemeBackgroundImage(): void {
  if (state.theme.backgroundImage.startsWith("blob:")) {
    URL.revokeObjectURL(state.theme.backgroundImage);
  }
}

function revokeAssetUrls(items: Array<ActivityAsset | MusicAsset>): void {
  items.forEach((item) => {
    if (item.isHydrated && item.persistMode === "blob" && item.src.startsWith("blob:")) {
      URL.revokeObjectURL(item.src);
    }
  });
}

function applyTheme(): void {
  const themeHost = document.documentElement;
  const backgroundImageValue = state.theme.backgroundImage
    ? `url("${state.theme.backgroundImage}")`
    : "none";

  themeHost.style.setProperty("--theme-app", state.theme.appColor);
  themeHost.style.setProperty("--theme-heading", state.theme.headingColor);
  themeHost.style.setProperty("--theme-muted", state.theme.mutedTextColor);
  themeHost.style.setProperty("--theme-soft", state.theme.softTextColor);
  themeHost.style.setProperty("--theme-button-text", state.theme.buttonTextColor);
  themeHost.style.setProperty("--theme-ghost", state.theme.ghostButtonColor);
  themeHost.style.setProperty("--theme-accent", state.theme.accentColor);
  themeHost.style.setProperty("--theme-panel", state.theme.panelTint);
  themeHost.style.setProperty("--theme-bg-start", state.theme.backgroundStart);
  themeHost.style.setProperty("--theme-bg-end", state.theme.backgroundEnd);
  themeHost.style.setProperty("--theme-bg-image", backgroundImageValue);
  themeHost.style.setProperty("--theme-correct", state.theme.correctColor);
  themeHost.style.setProperty("--theme-wrong", state.theme.wrongColor);
}

function syncBoardSizing(): void {
  const shell = root.querySelector<HTMLElement>(".music-shell");
  if (shell) {
    shell.style.setProperty("--shell-width", `${state.config.shellWidth}px`);
  }

  const grids = root.querySelectorAll<HTMLElement>(".activity-grid");
  grids.forEach((grid) => {
    grid.style.setProperty("--card-width", `${state.config.cardWidth}px`);
    grid.style.setProperty("--card-height", `${state.config.cardHeight}px`);
  });
}

function createPreviewSvg(title: string, bg: string, accent: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bg}" />
          <stop offset="100%" stop-color="#020617" />
        </linearGradient>
      </defs>
      <rect width="960" height="640" rx="44" fill="url(#bg)" />
      <circle cx="748" cy="140" r="140" fill="${accent}" fill-opacity="0.18" />
      <circle cx="204" cy="508" r="184" fill="${accent}" fill-opacity="0.1" />
      <rect x="82" y="96" width="320" height="188" rx="24" fill="${accent}" fill-opacity="0.12" />
      <rect x="450" y="320" width="368" height="164" rx="28" fill="${accent}" fill-opacity="0.14" />
      <text x="80" y="414" fill="#f8fafc" font-family="Segoe UI, Arial, sans-serif" font-size="72" font-weight="700">${title}</text>
      <text x="82" y="484" fill="#dbeafe" font-family="Segoe UI, Arial, sans-serif" font-size="28">Music Guess Demo</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createImagePlaceholder(title: string, kind: PictureKind): string {
  const kindLabel = getPictureKindLabel(kind);
  return createPreviewSvg(`${kindLabel}\n${title || "未命名"}`, "#1f2937", "#7dd3fc");
}

function createToneWavDataUrl(frequency: number): string {
  const sampleRate = 22050;
  const durationSeconds = 1.8;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const samples = new Int16Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const envelope = Math.min(1, time * 4) * Math.max(0, 1 - time / durationSeconds);
    const tone =
      Math.sin(2 * Math.PI * frequency * time) * 0.7 +
      Math.sin(2 * Math.PI * frequency * 1.5 * time) * 0.2;
    samples[index] = Math.round(tone * envelope * 32767);
  }

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  samples.forEach((sample, index) => {
    view.setInt16(44 + index * 2, sample, true);
  });

  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return `data:audio/wav;base64,${btoa(binary)}`;
}

function createEffectWavDataUrl(kind: AudioCueKey): string {
  const sampleRate = 22050;
  const durationSeconds =
    kind === "click"
      ? 0.08
      : kind === "success"
      ? 0.34
      : 0.42;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const samples = new Int16Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const progress = time / durationSeconds;
    const attack = Math.min(1, progress * 18);
    const release = Math.max(0, 1 - progress);

    let tone = 0;
    if (kind === "click") {
      tone =
        Math.sin(2 * Math.PI * 920 * time) * 0.7 +
        Math.sin(2 * Math.PI * 1280 * time) * 0.2;
    } else if (kind === "success") {
      const first = Math.sin(2 * Math.PI * 660 * time) * (progress < 0.45 ? 1 : 0);
      const second = Math.sin(2 * Math.PI * 990 * time) * (progress >= 0.28 ? 0.95 : 0);
      tone = first * 0.55 + second * 0.75;
    } else {
      const sweepFrequency = 420 - progress * 180;
      tone =
        Math.sin(2 * Math.PI * sweepFrequency * time) * 0.75 +
        Math.sin(2 * Math.PI * sweepFrequency * 0.5 * time) * 0.18;
    }

    const envelope = attack * release;
    samples[index] = Math.round(tone * envelope * 32767);
  }

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  samples.forEach((sample, index) => {
    view.setInt16(44 + index * 2, sample, true);
  });

  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return `data:audio/wav;base64,${btoa(binary)}`;
}

function createDemoActivities(): ActivityAsset[] {
  return [
    { id: "concert", name: "Summer Live", kind: "activity", src: createPreviewSvg("Summer Live", "#1d4ed8", "#7dd3fc"), source: "demo", persistMode: "inline" as const },
    { id: "sports", name: "Field Day", kind: "activity", src: createPreviewSvg("Field Day", "#0f766e", "#99f6e4"), source: "demo", persistMode: "inline" as const },
    { id: "festival", name: "Lantern Fest", kind: "activity", src: createPreviewSvg("Lantern Fest", "#b45309", "#fde68a"), source: "demo", persistMode: "inline" as const },
    { id: "ceremony", name: "Graduation", kind: "activity", src: createPreviewSvg("Graduation", "#7c3aed", "#ddd6fe"), source: "demo", persistMode: "inline" as const },
    { id: "party", name: "After Party", kind: "activity", src: createPreviewSvg("After Party", "#be185d", "#f9a8d4"), source: "demo", persistMode: "inline" as const },
    { id: "shiroko", name: "Shiroko", kind: "chara", src: createPreviewSvg("Shiroko", "#0f766e", "#99f6e4"), source: "demo", persistMode: "inline" as const },
    { id: "hoshino", name: "Hoshino", kind: "chara", src: createPreviewSvg("Hoshino", "#be185d", "#f9a8d4"), source: "demo", persistMode: "inline" as const },
    { id: "noa", name: "Noa", kind: "chara", src: createPreviewSvg("Noa", "#7c3aed", "#ddd6fe"), source: "demo", persistMode: "inline" as const },
    { id: "serika", name: "Serika", kind: "chara", src: createPreviewSvg("Serika", "#b45309", "#fde68a"), source: "demo", persistMode: "inline" as const },
    { id: "binah", name: "Binah", kind: "raid", src: createPreviewSvg("Binah", "#92400e", "#fdba74"), source: "demo", persistMode: "inline" as const },
    { id: "kaiten", name: "Kaiten FX", kind: "raid", src: createPreviewSvg("Kaiten FX", "#b91c1c", "#fda4af"), source: "demo", persistMode: "inline" as const },
    { id: "shirokuro", name: "Shiro & Kuro", kind: "raid", src: createPreviewSvg("Shiro Kuro", "#1d4ed8", "#bfdbfe"), source: "demo", persistMode: "inline" as const },
    { id: "hieronymus", name: "Hieronymus", kind: "raid", src: createPreviewSvg("Hieronymus", "#14532d", "#86efac"), source: "demo", persistMode: "inline" as const },
  ].map((activity) => createRuntimeActivityAsset(activity));
}

function createDemoMusics(): MusicAsset[] {
  return [
    { id: "music-concert", name: "Summer Live Theme", src: createToneWavDataUrl(392), source: "demo", persistMode: "inline" as const, activityIds: ["concert", "party"] },
    { id: "music-sports", name: "Field Day Anthem", src: createToneWavDataUrl(262), source: "demo", persistMode: "inline" as const, activityIds: ["sports"] },
    { id: "music-festival", name: "Lantern Night Mix", src: createToneWavDataUrl(330), source: "demo", persistMode: "inline" as const, activityIds: ["festival", "ceremony"] },
    { id: "music-binah", name: "Desert Colossus", src: createToneWavDataUrl(220), source: "demo", persistMode: "inline" as const, activityIds: ["binah"] },
    { id: "music-kaiten", name: "Hero Assault", src: createToneWavDataUrl(494), source: "demo", persistMode: "inline" as const, activityIds: ["kaiten", "shirokuro"] },
    { id: "music-hieronymus", name: "Sanctum Breaker", src: createToneWavDataUrl(294), source: "demo", persistMode: "inline" as const, activityIds: ["hieronymus"] },
  ].map((music) => createRuntimeMusicAsset(music));
}

async function serializeAudioConfig(audioConfig: AudioConfig): Promise<SerializedAudioConfig> {
  const entries = await Promise.all(
    AUDIO_CUE_KEYS.map(async (cue) => {
      const clip = audioConfig[cue].clip;
      if (!clip?.src) {
        return [cue, null] as const;
      }

      return [
        cue,
        {
          src: clip.src,
          mimeType: clip.mimeType,
          volume: audioConfig[cue].volume,
        },
      ] as const;
    }),
  );

  return Object.fromEntries(entries) as SerializedAudioConfig;
}

async function serializeActivities(activities: ActivityAsset[]): Promise<SerializedActivity[]> {
  return Promise.all(
    activities.map(async (activity) => {
      let src = activity.src;
      if (!activity.isHydrated && activity.storageKey) {
        const blob = await readBlobFromIndexedDb(activity.storageKey);
        src = blob ? await blobToDataUrl(blob) : "";
      } else if (activity.persistMode === "blob") {
        src = await blobToDataUrl(await fetch(activity.src).then((response) => response.blob()));
      }

      return {
        id: activity.id,
        name: activity.name,
        kind: activity.kind,
        src,
        source: activity.source,
        persistMode: "inline" as const,
      };
    }),
  );
}

async function serializeMusics(musics: MusicAsset[]): Promise<SerializedMusic[]> {
  return Promise.all(
    musics.map(async (music) => {
      let src = music.src;
      if (!music.isHydrated && music.storageKey) {
        const blob = await readBlobFromIndexedDb(music.storageKey);
        src = blob ? await blobToDataUrl(blob) : "";
      } else if (music.persistMode === "blob") {
        src = await blobToDataUrl(await fetch(music.src).then((response) => response.blob()));
      }

      return {
        id: music.id,
        name: music.name,
        src,
        source: music.source,
        persistMode: "inline" as const,
        activityIds: [...music.activityIds],
      };
    }),
  );
}

async function serializeWorkspace(): Promise<SavedWorkspace> {
  const activities = await serializeActivities(state.activities);
  const musics = await serializeMusics(state.musics);
  const audio = await serializeAudioConfig(state.audio);
  const themeBackgroundImage =
    state.themeBackgroundStored && state.themeBackgroundStorageKey
      ? await (async () => {
          const blob = await readBlobFromIndexedDb(state.themeBackgroundStorageKey!);
          return blob ? await blobToDataUrl(blob) : "";
        })()
      : state.theme.backgroundImage && state.theme.backgroundImage.startsWith("blob:")
      ? await blobToDataUrl(await fetch(state.theme.backgroundImage).then((response) => response.blob()))
      : state.theme.backgroundImage;

  return {
    version: 1,
    activities,
    musics,
    config: { ...state.config },
    musicVolume: state.musicVolume,
    theme: {
      ...state.theme,
      backgroundImage: themeBackgroundImage,
    },
    audio,
  };
}

function stopAudioPlayback(): void {
  stopAudioChannel("round");
}

function stopPreviewAudioPlayback(): void {
  stopAudioChannel("preview");
}

function formatAudioVolumePercentage(volume: number): string {
  return `${Math.round(clamp(volume, 0, 1) * 100)}%`;
}

async function playAudioCue(cue: AudioCueKey): Promise<void> {
  const cueConfig = state.audio[cue];
  const clip = cueConfig.clip;
  if (!clip?.src) {
    return;
  }

  try {
    await playAudioChannel(cue, clip.src, {
      restart: true,
      volume: cueConfig.volume,
    });
  } catch {
    console.warn(`Failed to play audio cue: ${cue}`);
  }
}

async function updateAudioCue(cue: AudioCueKey, files: FileList): Promise<void> {
  const audioFile = Array.from(files).find((file) => file.type.startsWith("audio/"));
  if (!audioFile) {
    setNotice("error", `没有读取到可用音频，请为${getAudioCueLabel(cue).title}选择音频文件。`);
    syncNotice();
    return;
  }

  stopAudioChannel(cue);
  state.audio[cue].clip = {
    src: await blobToDataUrl(audioFile),
    mimeType: audioFile.type || "audio/mpeg",
  };
  void persistWorkspace();
  setNotice("success", `${getAudioCueLabel(cue).title}已更新。`);
  syncNotice();
  syncAudioConfigPanel();
}

function clearAudioCue(cue: AudioCueKey): void {
  stopAudioChannel(cue);
  state.audio[cue].clip = null;
  void persistWorkspace();
  setNotice("info", `已清除${getAudioCueLabel(cue).title}。`);
  syncNotice();
  syncAudioConfigPanel();
}

function updateAudioCueVolume(cue: AudioCueKey, rawValue: string): void {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return;
  }

  state.audio[cue].volume = clamp(numeric / 100, 0, 1);
  void persistWorkspace();

  const volumeLabel = root.querySelector<HTMLElement>(`[data-audio-volume-label="${cue}"]`);
  if (volumeLabel) {
    volumeLabel.textContent = formatAudioVolumePercentage(state.audio[cue].volume);
  }
}

function updateMusicVolume(rawValue: string): void {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return;
  }

  state.musicVolume = clamp(numeric / 100, 0, 1);
  const activeRoundAudio = activeAudioByChannel.get("round");
  if (activeRoundAudio) {
    activeRoundAudio.volume = state.musicVolume;
  }
  void persistWorkspace();

  const volumeLabel = root.querySelector<HTMLElement>("[data-music-volume-label]");
  if (volumeLabel) {
    volumeLabel.textContent = formatAudioVolumePercentage(state.musicVolume);
  }
}

async function resolvePersistedAudioConfig(audio?: PersistedAudioConfig): Promise<SerializedAudioConfig> {
  const audioEntries = await Promise.all(
    AUDIO_CUE_KEYS.map(async (cue) => {
      const clip = audio?.[cue];
      if (!clip) {
        return [cue, null] as const;
      }

      if (clip.src) {
        return [
          cue,
          {
            src: clip.src,
            mimeType: clip.mimeType,
            volume: clip.volume,
          },
        ] as const;
      }

      if (!clip.storageKey) {
        return [cue, null] as const;
      }

      const blob = await readBlobFromIndexedDb(clip.storageKey);
      if (!blob) {
        return [cue, null] as const;
      }

      return [
        cue,
        {
          src: await blobToDataUrl(blob),
          mimeType: clip.mimeType,
          volume: clip.volume,
        },
      ] as const;
    }),
  );

  return Object.fromEntries(audioEntries) as SerializedAudioConfig;
}

function applyWorkspaceData(payload: SavedWorkspace | PersistedWorkspace): void {
  stopAllManagedAudio();
  releaseThemeBackgroundImage();
  revokeAssetUrls(state.activities);
  revokeAssetUrls(state.musics);

  state.hydratedActivityIds = [];
  state.hydratedMusicIds = [];

  state.activities = payload.activities.map((activity) => createRuntimeActivityAsset(activity));
  state.musics = payload.musics.map((music) => createRuntimeMusicAsset(music));

  state.config = {
    shellWidth: normalizeCardDimension(payload.config.shellWidth ?? DEFAULT_CONFIG.shellWidth, DEFAULT_CONFIG.shellWidth),
    cardWidth: normalizeCardDimension(payload.config.cardWidth, DEFAULT_CONFIG.cardWidth),
    cardHeight: normalizeCardDimension(payload.config.cardHeight, DEFAULT_CONFIG.cardHeight),
    maxDecodedPictures: normalizeCardDimension(payload.config.maxDecodedPictures ?? DEFAULT_CONFIG.maxDecodedPictures, DEFAULT_CONFIG.maxDecodedPictures),
    maxDecodedMusics: normalizeCardDimension(payload.config.maxDecodedMusics ?? DEFAULT_CONFIG.maxDecodedMusics, DEFAULT_CONFIG.maxDecodedMusics),
  };
  state.musicVolume = clamp(payload.musicVolume ?? DEFAULT_MUSIC_VOLUME, 0, 1);

  state.theme = {
    appColor: payload.theme.appColor || DEFAULT_THEME.appColor,
    headingColor: payload.theme.headingColor || DEFAULT_THEME.headingColor,
    mutedTextColor: payload.theme.mutedTextColor || DEFAULT_THEME.mutedTextColor,
    softTextColor: payload.theme.softTextColor || DEFAULT_THEME.softTextColor,
    buttonTextColor: payload.theme.buttonTextColor || DEFAULT_THEME.buttonTextColor,
    ghostButtonColor: payload.theme.ghostButtonColor || DEFAULT_THEME.ghostButtonColor,
    accentColor: payload.theme.accentColor || DEFAULT_THEME.accentColor,
    panelTint: payload.theme.panelTint || DEFAULT_THEME.panelTint,
    backgroundStart: payload.theme.backgroundStart || DEFAULT_THEME.backgroundStart,
    backgroundEnd: payload.theme.backgroundEnd || DEFAULT_THEME.backgroundEnd,
    backgroundImage: payload.theme.backgroundImage || "",
    correctColor: payload.theme.correctColor || DEFAULT_THEME.correctColor,
    wrongColor: payload.theme.wrongColor || DEFAULT_THEME.wrongColor,
  };
  state.themeBackgroundStorageKey = "themeBackgroundStorageKey" in payload ? payload.themeBackgroundStorageKey ?? null : null;
  state.themeBackgroundMimeType = "themeBackgroundMimeType" in payload ? payload.themeBackgroundMimeType ?? null : null;
  state.themeBackgroundStored = !!state.themeBackgroundStorageKey;
  state.audio = createDefaultAudioConfig();

  state.phase = "setup";
  state.round = null;
  state.selectedPlayKind = "activity";
  state.activityFilterMode = "all";
  state.selectedActivityId = null;
  state.linkingActivityId = null;
  state.activitySearchQuery = "";
  state.musicSearchQuery = "";
  state.isAudioPlaying = false;
  applyTheme();
  enforceHydrationLimits();
}

async function persistWorkspace(): Promise<void> {
  try {
    const persistedWorkspace = await createPersistedWorkspaceSnapshotFromState();
    const activityAssets = await Promise.all(
      state.activities.map(async (activity) => {
        if (activity.storageKey) {
          return { storageKey: activity.storageKey, src: undefined };
        }

        if (activity.persistMode === "blob") {
          return {
            storageKey: createAssetStorageKey("activity", activity.id),
            src: await blobToDataUrl(await fetch(activity.src).then((response) => response.blob())),
          };
        }

        return { storageKey: createAssetStorageKey("activity", activity.id), src: activity.src };
      }),
    );
    const musicAssets = await Promise.all(
      state.musics.map(async (music) => {
        if (music.storageKey) {
          return { storageKey: music.storageKey, src: undefined };
        }

        if (music.persistMode === "blob") {
          return {
            storageKey: createAssetStorageKey("music", music.id),
            src: await blobToDataUrl(await fetch(music.src).then((response) => response.blob())),
          };
        }

        return { storageKey: createAssetStorageKey("music", music.id), src: music.src };
      }),
    );
    const themeAssets =
      state.theme.backgroundImage && !state.themeBackgroundStored && state.theme.backgroundImage.startsWith("blob:")
        ? [
            {
              storageKey: createAssetStorageKey("theme", "background"),
              src: await blobToDataUrl(await fetch(state.theme.backgroundImage).then((response) => response.blob())),
            },
          ]
        : [];
    const audioAssets = AUDIO_CUE_KEYS.map((cue) => ({
      storageKey: createAssetStorageKey("audio", cue),
      src: state.audio[cue].clip?.src ?? "",
    }));

    await writePersistedWorkspaceSnapshotToIndexedDb(
      persistedWorkspace,
      activityAssets,
      musicAssets,
      themeAssets,
      audioAssets,
    );
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    try {
      const fallbackPayload = await serializeWorkspace();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fallbackPayload));
    } catch {
      setNotice("error", "当前浏览器无法保存本地工作台。");
    }
  }
}

async function persistWorkspaceSnapshot(payload: SavedWorkspace): Promise<void> {
  try {
    await writeWorkspaceToIndexedDb(payload);
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      throw new Error("Failed to persist imported workspace snapshot.");
    }
  }
}

function scheduleWorkspacePersist(): void {
  if (pendingWorkspacePersistTimer !== null) {
    window.clearTimeout(pendingWorkspacePersistTimer);
  }

  pendingWorkspacePersistTimer = window.setTimeout(() => {
    pendingWorkspacePersistTimer = null;
    void persistWorkspace();
  }, WORKSPACE_PERSIST_DELAY_MS);
}

async function restoreWorkspace(): Promise<boolean> {
  try {
    const indexedDbWorkspace = await readWorkspaceFromIndexedDb();
    if (indexedDbWorkspace) {
      applyWorkspaceData(indexedDbWorkspace);
      const persistedAudio =
        "version" in indexedDbWorkspace && indexedDbWorkspace.version === 3
          ? indexedDbWorkspace.audio
          : indexedDbWorkspace.audio;
      const resolvedAudio = "version" in indexedDbWorkspace && indexedDbWorkspace.version === 3
        ? await resolvePersistedAudioConfig(persistedAudio)
        : indexedDbWorkspace.audio;
      AUDIO_CUE_KEYS.forEach((cue) => {
        const serialized = resolvedAudio?.[cue];
        if (!serialized) {
          return;
        }
        state.audio[cue] = {
          clip: serialized.src
            ? {
                src: serialized.src,
                mimeType: serialized.mimeType || "audio/mpeg",
              }
            : null,
          volume: clamp(serialized.volume ?? state.audio[cue].volume, 0, 1),
        };
      });
      return true;
    }
  } catch {
    // fall through
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw) as SavedWorkspace | WorkspaceSnapshotRecord;
    const workspace =
      "version" in parsed && parsed.version === 2 && "workspace" in parsed
        ? parsed.workspace
        : (parsed as SavedWorkspace);
    if (workspace.version === 1) {
      applyWorkspaceData(workspace);
      AUDIO_CUE_KEYS.forEach((cue) => {
        const serialized = workspace.audio?.[cue];
        if (!serialized) {
          return;
        }
        state.audio[cue] = {
          clip: serialized.src
            ? {
                src: serialized.src,
                mimeType: serialized.mimeType || "audio/mpeg",
              }
            : null,
          volume: clamp(serialized.volume ?? state.audio[cue].volume, 0, 1),
        };
      });
      void writeWorkspaceToIndexedDb(workspace);
      return true;
    }

    if (workspace.version === 3) {
      applyWorkspaceData(workspace);
      const resolvedAudio = await resolvePersistedAudioConfig(workspace.audio);
      AUDIO_CUE_KEYS.forEach((cue) => {
        const serialized = resolvedAudio?.[cue];
        if (!serialized) {
          return;
        }
        state.audio[cue] = {
          clip: serialized.src
            ? {
                src: serialized.src,
                mimeType: serialized.mimeType || "audio/mpeg",
              }
            : null,
          volume: clamp(serialized.volume ?? state.audio[cue].volume, 0, 1),
        };
      });
      return true;
    }

    return true;
  } catch {
    return false;
  }
}

async function exportWorkspacePack(): Promise<void> {
  try {
    const { default: JSZip } = await import("jszip");
    const payload = await serializeWorkspace();
    const zip = new JSZip();
    const pack: SavedWorkspace = {
      ...payload,
      activities: [],
      musics: [],
      theme: {
        ...payload.theme,
        backgroundImage: payload.theme.backgroundImage,
      },
      audio: payload.audio ? { ...payload.audio } : undefined,
    };

    for (const activity of payload.activities) {
      const blob = dataUrlToBlob(activity.src ?? "");
      const fileName = `activities/${activity.id}.${getFileExtensionFromMime(blob.type)}`;
      zip.file(fileName, blob);
      pack.activities.push({
        id: activity.id,
        name: activity.name,
        kind: activity.kind,
        file: fileName,
        mimeType: blob.type,
        source: activity.source,
        persistMode: "inline",
      });
    }

    for (const music of payload.musics) {
      const blob = dataUrlToBlob(music.src ?? "");
      const fileName = `musics/${music.id}.${getFileExtensionFromMime(blob.type)}`;
      zip.file(fileName, blob);
      pack.musics.push({
        id: music.id,
        name: music.name,
        file: fileName,
        mimeType: blob.type,
        source: music.source,
        persistMode: "inline",
        activityIds: [...music.activityIds],
      });
    }

    if (pack.audio) {
      for (const cue of AUDIO_CUE_KEYS) {
        const clip = pack.audio[cue];
        if (!clip?.src) {
          continue;
        }

        const blob = dataUrlToBlob(clip.src);
        const fileName = `audio/${cue}.${getFileExtensionFromMime(blob.type)}`;
        zip.file(fileName, blob);
        pack.audio[cue] = {
          file: fileName,
          mimeType: blob.type,
          volume: clip.volume,
        };
      }
    }

    if (payload.theme.backgroundImage) {
      const backgroundBlob = dataUrlToBlob(payload.theme.backgroundImage);
      const backgroundFile = `theme/background.${getFileExtensionFromMime(backgroundBlob.type)}`;
      zip.file(backgroundFile, backgroundBlob);
      pack.theme.backgroundImage = backgroundFile;
    }

    zip.file("workspace.json", JSON.stringify(pack, null, 2));
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "music-activity-pack.zip";
    anchor.click();
    URL.revokeObjectURL(url);

    setNotice("success", "素材压缩包已导出。");
    render();
  } catch {
    setNotice("error", "素材压缩包导出失败，请检查当前素材是否完整。");
    render();
  }
}

async function importWorkspacePack(files: FileList): Promise<void> {
  const file = files[0];
  if (!file) {
    return;
  }

  try {
    setNotice("info", "正在读取素材压缩包...", {
      current: 0,
      indeterminate: true,
    });
    render();

    const { default: JSZip } = await import("jszip");
    setNotice("info", "正在解析压缩包目录...", {
      current: 1,
      total: 4,
    });
    syncNotice();

    const zip = await JSZip.loadAsync(file);
    const workspaceFile = zip.file("workspace.json");
    if (!workspaceFile) {
      throw new Error("workspace.json missing");
    }

    setNotice("info", "正在读取工作台配置...", {
      current: 2,
      total: 4,
    });
    syncNotice();

    const parsed = JSON.parse(await workspaceFile.async("string")) as SavedWorkspace;
    if (parsed.version !== 1) {
      throw new Error("unsupported version");
    }

    const totalAssets =
      parsed.activities.length +
      parsed.musics.length +
      (parsed.theme.backgroundImage ? 1 : 0) +
      AUDIO_CUE_KEYS.filter((cue) => parsed.audio?.[cue]?.file).length;
    let processedAssets = 0;
    const updateAssetImportProgress = (label: string): void => {
      setNotice("info", label, {
        current: processedAssets,
        total: totalAssets,
      });
      syncNotice();
    };

    setNotice("info", "正在解压图片素材...", {
      current: 0,
      total: Math.max(totalAssets, 1),
    });
    syncNotice();

    const activities: SerializedActivity[] = [];
    for (const activity of parsed.activities) {
      const fileEntry = activity.file ? zip.file(activity.file) : null;
      if (!fileEntry) {
        throw new Error("missing activity asset");
      }

      activities.push({
        ...activity,
        src: await blobToDataUrl(await fileEntry.async("blob")),
      });
      processedAssets += 1;
      updateAssetImportProgress("正在解压图片素材...");
    }

    const musics: SerializedMusic[] = [];
    for (const music of parsed.musics) {
      const fileEntry = music.file ? zip.file(music.file) : null;
      if (!fileEntry) {
        throw new Error("missing music asset");
      }

      musics.push({
        ...music,
        src: await blobToDataUrl(await fileEntry.async("blob")),
      });
      processedAssets += 1;
      updateAssetImportProgress("正在解压音乐素材...");
    }

    let backgroundImage = "";
    if (parsed.theme.backgroundImage) {
      const backgroundEntry = zip.file(parsed.theme.backgroundImage);
      if (!backgroundEntry) {
        throw new Error("missing background asset");
      }
      backgroundImage = await blobToDataUrl(await backgroundEntry.async("blob"));
      processedAssets += 1;
      updateAssetImportProgress("正在解压背景素材...");
    }

    const resolvedAudioEntries = await Promise.all(
      AUDIO_CUE_KEYS.map(async (cue) => {
        const clip = parsed.audio?.[cue];
        if (!clip) {
          return [cue, null] as const;
        }

        if (clip.src) {
          return [cue, clip] as const;
        }

        const fileEntry = clip.file ? zip.file(clip.file) : null;
        if (!fileEntry) {
          throw new Error(`missing ${cue} audio asset`);
        }

        const src = await blobToDataUrl(await fileEntry.async("blob"));
        processedAssets += 1;
        updateAssetImportProgress("正在解压音效素材...");
        return [
          cue,
          {
            src,
            mimeType: clip.mimeType,
            volume: clip.volume,
          },
        ] as const;
      }),
    );

    setNotice("info", "正在应用素材并保存本地工作台...", {
      current: 4,
      total: 4,
    });
    syncNotice();

    const importedWorkspace: SavedWorkspace = {
      ...parsed,
      activities,
      musics,
      theme: {
        ...parsed.theme,
        backgroundImage,
      },
      audio: Object.fromEntries(resolvedAudioEntries) as SerializedAudioConfig,
    };

    applyWorkspaceData(importedWorkspace);

    try {
      await persistWorkspaceSnapshot(importedWorkspace);
      setNotice("success", "素材压缩包已导入。");
    } catch {
      setNotice("error", "素材已导入当前页面，但当前设备无法完成本地保存。若刷新页面，可能需要重新导入。");
    }
    render();
  } catch {
    setNotice("error", "素材压缩包读取失败，请确认 zip 结构正确。");
    render();
  }
}

function updateThemeBackgroundImage(files: FileList): void {
  const image = Array.from(files).find((file) => file.type.startsWith("image/"));
  if (!image) {
    setNotice("error", "没有读取到可用背景图，请确认选择的是图片文件。");
    render();
    return;
  }

  releaseThemeBackgroundImage();
  state.theme.backgroundImage = URL.createObjectURL(image);
  state.themeBackgroundStorageKey = null;
  state.themeBackgroundMimeType = image.type || "image/png";
  state.themeBackgroundStored = false;
  applyTheme();
  void persistWorkspace();
  setNotice("success", "已更新 App 背景图片。");
  render();
}

function clearThemeBackgroundImage(): void {
  releaseThemeBackgroundImage();
  state.theme.backgroundImage = "";
  state.themeBackgroundStorageKey = null;
  state.themeBackgroundMimeType = null;
  state.themeBackgroundStored = false;
  applyTheme();
  void persistWorkspace();
  setNotice("info", "已清除 App 背景图片。");
  render();
}

function importActivityFiles(files: FileList): void {
  const imported = Array.from(files)
    .filter((file) => file.type.startsWith("image/"))
    .map((file) =>
      createRuntimeActivityAsset({
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, ""),
        kind: "uncategorized" as PictureKind,
        src: URL.createObjectURL(file),
        source: "upload" as const,
        persistMode: "blob" as const,
      }),
    );

  if (imported.length === 0) {
    setNotice("error", "没有读取到可用活动图片，请确认选择的是图片文件。");
    render();
    return;
  }

  state.activities = [...state.activities, ...imported];
  movePagerToLastPage("picture", state.activities.length);
  state.phase = "setup";
  void persistWorkspace();
  setNotice("success", `已导入 ${imported.length} 张图片，默认标记为未分类。`);
  render();
}

function updateActivityKind(activityId: string, kind: PictureKind): void {
  state.activities = state.activities.map((activity) =>
    activity.id === activityId ? { ...activity, kind } : activity,
  );
  state.phase = "setup";
  void persistWorkspace();
}

function importMusicFiles(files: FileList): void {
  const imported = Array.from(files)
    .filter((file) => file.type.startsWith("audio/"))
    .map((file) =>
      createRuntimeMusicAsset({
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, ""),
        src: URL.createObjectURL(file),
        source: "upload" as const,
        persistMode: "blob" as const,
        activityIds: [] as string[],
      }),
    );

  if (imported.length === 0) {
    setNotice("error", "没有读取到可用音乐，请确认选择的是音频文件。");
    render();
    return;
  }

  state.musics = [...state.musics, ...imported];
  movePagerToLastPage("music", state.musics.length);
  state.phase = "setup";
  void persistWorkspace();
  setNotice("success", `已导入 ${imported.length} 条音乐，请为它们选择对应活动图。`);
  render();
}

function importMusicFilesForActivity(files: FileList, activityId: string): void {
  const imported = Array.from(files)
    .filter((file) => file.type.startsWith("audio/"))
    .map((file) =>
      createRuntimeMusicAsset({
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, ""),
        src: URL.createObjectURL(file),
        source: "upload" as const,
        persistMode: "blob" as const,
        activityIds: [activityId],
      }),
    );

  if (imported.length === 0) {
    setNotice("error", "没有读取到可用音乐，请确认选择的是音频文件。");
    syncNotice();
    return;
  }

  state.musics = [...state.musics, ...imported];
  state.phase = "setup";
  movePagerToLastPage("music", state.musics.length);
  movePagerToLastPage(
    "music-manager-linked",
    state.musics.filter((music) => music.activityIds.includes(activityId)).length,
  );
  void persistWorkspace();
  setNotice("success", `已导入并绑定 ${imported.length} 条音乐。`);
  syncNotice();
  syncActivityList();
  syncMusicList();
  syncLinkingList();
}

function removeActivity(activityId: string): void {
  const target = state.activities.find((activity) => activity.id === activityId);
  if (!target) {
    return;
  }

  if (target.persistMode === "blob" && target.src.startsWith("blob:")) {
    URL.revokeObjectURL(target.src);
  }

  state.activities = state.activities.filter((activity) => activity.id !== activityId);
  state.musics = state.musics.map((music) => ({
    ...music,
    activityIds: music.activityIds.filter((id) => id !== activityId),
  }));
  state.phase = "setup";
  void persistWorkspace();
  setNotice("info", `已移除活动图：${target.name}。`);
  render();
}

function removeMusic(musicId: string): void {
  const target = state.musics.find((music) => music.id === musicId);
  if (!target) {
    return;
  }

  if (target.persistMode === "blob" && target.src.startsWith("blob:")) {
    URL.revokeObjectURL(target.src);
  }

  state.musics = state.musics.filter((music) => music.id !== musicId);
  state.phase = "setup";
  void persistWorkspace();
  setNotice("info", `已移除音乐：${target.name}。`);
  render();
}

function updateActivityName(activityId: string, value: string): void {
  state.activities = state.activities.map((activity) =>
    activity.id === activityId ? { ...activity, name: value } : activity,
  );
  void persistWorkspace();
}

function updateMusicName(musicId: string, value: string): void {
  state.musics = state.musics.map((music) =>
    music.id === musicId ? { ...music, name: value } : music,
  );
  void persistWorkspace();
}

function toggleMusicActivityLink(activityId: string, musicId: string): void {
  state.musics = state.musics.map((music) => {
    if (music.id !== musicId) {
      return music;
    }

    const exists = music.activityIds.includes(activityId);
    return {
      ...music,
      activityIds: exists
        ? music.activityIds.filter((id) => id !== activityId)
        : [...music.activityIds, activityId],
    };
  });
  scheduleWorkspacePersist();
}

async function togglePreviewMusic(musicId: string): Promise<void> {
  const music = state.musics.find((item) => item.id === musicId);
  if (!music) {
    return;
  }

  await ensureMusicHydrated(musicId);

  const previewAudio = activeAudioByChannel.get("preview");
  const expectedSrc = resolveAudioSource(music.src);
  const isCurrentPreview =
    !!previewAudio && resolveAudioSource(previewAudio.currentSrc || previewAudio.src) === expectedSrc;

  if (state.previewMusicId === musicId && previewAudio && isCurrentPreview && !previewAudio.paused) {
    stopPreviewAudioPlayback();
    render();
    return;
  }

  try {
    await playAudioChannel("preview", music.src, { restart: true });
    state.previewMusicId = musicId;
    render();
  } catch {
    state.previewMusicId = null;
    setNotice("error", "音乐试听失败，请确认音频文件可用。");
    render();
  }
}

function setLinkingActivity(activityId: string | null): void {
  if (activityId === null) {
    stopPreviewAudioPlayback();
  }
  state.linkingActivityId = activityId;
  state.musicManagerSearchQuery = "";
  state.pagers["music-manager-linked"].page = 1;
  state.pagers["music-manager-unlinked"].page = 1;
  render();
}

function updateMusicSearchQuery(value: string): void {
  state.musicSearchQuery = value;
}

function updateMusicManagerSearchQuery(value: string): void {
  state.musicManagerSearchQuery = value;
  state.pagers["music-manager-linked"].page = 1;
  state.pagers["music-manager-unlinked"].page = 1;
}

function switchAssetBankTab(tab: AssetBankTab): void {
  if (state.assetBankTab === tab) {
    return;
  }

  state.assetBankTab = tab;
  render();
}

function updatePagerPage(
  pagerKey: "picture" | "music" | "music-manager-linked" | "music-manager-unlinked",
  page: number,
): void {
  state.pagers[pagerKey].page = Math.max(1, page);
  render();
}

function updateActivitySearchQuery(value: string): void {
  state.activitySearchQuery = value;
}

function updateSelectedPlayKind(kind: PictureKind): void {
  state.selectedPlayKind = kind;
  state.phase = "setup";
  state.round = null;
  state.selectedActivityId = null;
  stopAudioPlayback();
  render();
}

function updateActivityFilterMode(mode: ActivityFilterMode): void {
  if (state.activityFilterMode === mode) {
    return;
  }

  state.activityFilterMode = mode;
  state.pagers.picture.page = 1;
}

function updateConfigValue(key: keyof GameConfig, rawValue: string): void {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return;
  }

  state.config[key] = normalizeCardDimension(numeric, DEFAULT_CONFIG[key]);
  if (key === "maxDecodedPictures" || key === "maxDecodedMusics") {
    enforceHydrationLimits();
  }
  void persistWorkspace();
  syncBoardSizing();
}

function updateThemeValue(key: keyof ThemeConfig, value: string): void {
  state.theme[key] = value;
  applyTheme();
  void persistWorkspace();
}

function getAvailableActivitiesForSelectedKind(): ActivityAsset[] {
  return state.activities.filter((activity) => activity.kind === state.selectedPlayKind);
}

function hasResolvableRound(availableActivities: ActivityAsset[]): boolean {
  const availableActivityIds = new Set(availableActivities.map((activity) => activity.id));

  return state.musics.some((music) => {
    const linkedCount = countMusicMatchesInActivities(music, availableActivityIds);
    const unlinkedCount = availableActivities.length - linkedCount;
    return linkedCount >= 1 && unlinkedCount >= 3;
  });
}

function validateGameSetup(): string[] {
  const errors: string[] = [];
  const availableActivities = getAvailableActivitiesForSelectedKind();
  const availableActivityIds = new Set(availableActivities.map((activity) => activity.id));
  const eligibleMusic = state.musics.filter((music) =>
    music.activityIds.some((activityId) => availableActivityIds.has(activityId)),
  );

  if (availableActivities.length < 4) {
    errors.push(`至少需要 4 张${getPictureKindLabel(state.selectedPlayKind)}才能开始游戏。`);
  }

  if (eligibleMusic.length === 0) {
    errors.push("至少需要 1 条已经绑定当前图片类型的音乐才能开始游戏。");
  }

  if (eligibleMusic.length > 0 && !hasResolvableRound(availableActivities)) {
    errors.push("当前绑定关系会导致题目歧义：没有任何音乐能在 4 张候选图里唯一命中 1 张图。");
  }

  return errors;
}

function createRound(): ActiveRound {
  const availableActivities = getAvailableActivitiesForSelectedKind();
  const maxAttempts = 200;
  let fallbackRound: ActiveRound | null = null;
  let recentHitRetries = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const pickedActivities = sampleMany(availableActivities, 4);
    const pickedActivityIds = new Set(pickedActivities.map((activity) => activity.id));
    const eligibleMusics = state.musics.filter(
      (music) => countMusicMatchesInActivities(music, pickedActivityIds) === 1,
    );

    if (eligibleMusics.length === 0) {
      continue;
    }

    const music = eligibleMusics[Math.floor(Math.random() * eligibleMusics.length)];
    const candidateRound = {
      activities: pickedActivities,
      music,
      correctActivityIds: music.activityIds.filter((activityId) => pickedActivityIds.has(activityId)),
    };

    if (!state.recentAnswerMusicIds.includes(music.id)) {
      return candidateRound;
    }

    fallbackRound = candidateRound;
    recentHitRetries += 1;
    if (recentHitRetries >= RECENT_ANSWER_REROLL_LIMIT) {
      return candidateRound;
    }
  }

  if (fallbackRound) {
    return fallbackRound;
  }

  throw new Error("Failed to create an unambiguous round.");
}

function pushRecentAnswerMusicId(musicId: string): void {
  state.recentAnswerMusicIds = [...state.recentAnswerMusicIds, musicId].slice(-RECENT_ANSWER_HISTORY_LIMIT);
}

function syncRoundAudio(): void {
  if (!state.round) {
    stopAudioPlayback();
    return;
  }
}

async function startGame(): Promise<void> {
  const errors = validateGameSetup();
  if (errors.length > 0) {
    setNotice("error", errors[0]);
    render();
    return;
  }

  stopAudioPlayback();
  state.round = createRound();
  state.phase = "playing";
  state.selectedActivityId = null;
  pushRecentAnswerMusicId(state.round.music.id);
  syncRoundAudio();
  setNotice("info", "正在准备本题的图片与音乐...", {
    current: 0,
    indeterminate: true,
  });
  render();

  try {
    await ensureRoundAssetsReady(state.round);
    await playAudioChannel("round", state.round.music.src, { restart: true, volume: state.musicVolume });
    state.isAudioPlaying = true;
    setNotice("success", `题目已生成，已自动播放音乐。请选择对应的${getPictureKindLabel(state.selectedPlayKind)}。`);
  } catch {
    state.isAudioPlaying = false;
    setNotice("error", "题目已生成，但题面资源或音乐加载失败。请重试或检查素材包。");
  }
  render();
}

function restartGame(): void {
  void startGame();
}

function openWorkbench(): void {
  state.isWorkbenchOpen = true;
  render();
}

function closeWorkbench(): void {
  state.isWorkbenchOpen = false;
  render();
}

async function toggleAudioPlayback(): Promise<void> {
  if (!state.round) {
    return;
  }

  try {
    await ensureMusicHydrated(state.round.music.id);
    const roundAudio = activeAudioByChannel.get("round");
    const expectedSrc = resolveAudioSource(state.round.music.src);
    const isCurrentRoundAudio =
      !!roundAudio && resolveAudioSource(roundAudio.currentSrc || roundAudio.src) === expectedSrc;

    if (roundAudio && isCurrentRoundAudio && !roundAudio.paused) {
      roundAudio.pause();
      state.isAudioPlaying = false;
      setNotice("info", "音乐已暂停。");
    } else {
      await playAudioChannel("round", state.round.music.src, { volume: state.musicVolume });
      state.isAudioPlaying = true;
      setNotice("info", "音乐播放中。");
    }
    render();
  } catch {
    state.isAudioPlaying = false;
    setNotice("error", "音乐播放失败，请确认音频文件可用。");
    render();
  }
}

function replayAudio(): void {
  if (!state.round) {
    return;
  }

  void ensureMusicHydrated(state.round.music.id)
    .then(() => playAudioChannel("round", state.round!.music.src, { restart: true, volume: state.musicVolume }))
    .then(() => {
      state.isAudioPlaying = true;
      setNotice("info", "已从开头重新播放音乐。");
      render();
    })
    .catch(() => {
      state.isAudioPlaying = false;
      setNotice("error", "音乐重播失败，请确认音频文件可用。");
      render();
    });
}

function getReviewedActivityMusic(activityId: string): MusicAsset | null {
  if (!state.round || state.phase !== "reviewed") {
    return null;
  }

  if (state.round.correctActivityIds.includes(activityId)) {
    return state.round.music;
  }

  return state.musics.find((music) => music.activityIds.includes(activityId)) ?? null;
}

async function playReviewedActivityMusic(activityId: string): Promise<void> {
  const activity = state.round?.activities.find((item) => item.id === activityId);
  if (!activity) {
    return;
  }

  const music = getReviewedActivityMusic(activityId);
  if (!music) {
    setNotice("error", `${activity.name} 当前没有可试听的绑定音乐。`);
    render();
    return;
  }

  try {
    await ensureMusicHydrated(music.id);
    await playAudioChannel("round", music.src, { restart: true, volume: state.musicVolume });
    state.isAudioPlaying = true;
    setNotice("info", `正在试听 ${activity.name} 绑定的音乐：${music.name}。`);
    render();
  } catch {
    state.isAudioPlaying = false;
    setNotice("error", "图片关联音乐播放失败，请确认音频文件可用。");
    render();
  }
}

function selectActivity(activityId: string): void {
  if (!state.round) {
    return;
  }

  if (state.phase === "reviewed") {
    void playReviewedActivityMusic(activityId);
    return;
  }

  if (state.phase !== "playing") {
    return;
  }

  state.selectedActivityId = state.selectedActivityId === activityId ? null : activityId;
  setNotice(
    "info",
    state.selectedActivityId ? "已选择活动图，点击提交即可判定。" : "已取消当前选择。",
  );
  render();
}

async function submitAnswer(): Promise<void> {
  if (!state.round || state.phase !== "playing") {
    return;
  }

  if (!state.selectedActivityId) {
    setNotice("error", "请先选择一张活动图片再提交。");
    render();
    return;
  }

  state.phase = "reviewed";
  setNotice("info", "正在准备四张图片对应的快速试听...", {
    current: 0,
    indeterminate: true,
  });
  render();

  try {
    await ensureRoundAssetsReady(state.round, { includeReviewedPreviewMusic: true });
  } catch {
    setNotice("error", "判题完成，但部分试听资源加载失败。");
  }

  if (state.round.correctActivityIds.includes(state.selectedActivityId)) {
    void playAudioCue("success");
    setNotice("success", "回答正确，这张活动图属于当前音乐。现在可以点击图片试听它们各自的音乐。");
    void launchSuccessConfetti();
  } else {
    void playAudioCue("failure");
    setNotice("error", "回答错误，正确答案已经高亮显示。现在可以点击图片试听它们各自的音乐。");
  }

  render();
}

function renderActivityEditor(activity: ActivityAsset): string {
  const isLinking = state.linkingActivityId === activity.id;
  return `
    <article class="asset-row ${isLinking ? "is-linking" : ""}">
      <img src="${activity.src}" alt="${activity.name}" loading="lazy" />
      <div class="asset-form">
        <label class="field">
          <span>图片名称</span>
          <input type="text" value="${activity.name}" data-activity-name="${activity.id}" />
        </label>
        <label class="field">
          <span>图片类型</span>
          <select data-activity-kind="${activity.id}">
            <option value="uncategorized" ${activity.kind === "uncategorized" ? "selected" : ""}>未分类</option>
            <option value="activity" ${activity.kind === "activity" ? "selected" : ""}>活动图</option>
            <option value="chara" ${activity.kind === "chara" ? "selected" : ""}>角色图</option>
            <option value="raid" ${activity.kind === "raid" ? "selected" : ""}>总力战图</option>
          </select>
        </label>
        <div class="asset-chip-row">
          <button class="ghost-button compact-action" type="button" data-link-activity="${activity.id}">
            ${isLinking ? "收起音乐关联" : "添加 / 管理音乐"}
          </button>
          <small>已关联 ${state.musics.filter((music) => music.activityIds.includes(activity.id)).length} 条音乐</small>
        </div>
      </div>
      <button class="ghost-button danger-button" type="button" data-remove-activity="${activity.id}">移除</button>
    </article>
  `;
}

function getFilteredActivities(): ActivityAsset[] {
  const query = state.activitySearchQuery.trim().toLowerCase();
  return state.activities.filter((activity) => {
    const matchesQuery = !query || activity.name.toLowerCase().includes(query);
    const matchesFilter =
      state.activityFilterMode === "all" || activity.kind === "uncategorized";
    return matchesQuery && matchesFilter;
  });
}

function renderActivityList(): string {
  const filteredActivities = getFilteredActivities();
  const pagedActivities = paginateItems(filteredActivities, state.pagers.picture);
  state.pagers.picture.page = pagedActivities.page;
  if (filteredActivities.length === 0) {
    return `<p class="empty-copy">没有匹配的图片。</p>`;
  }

  return `
    <div class="asset-list">
      ${pagedActivities.items.map((activity) => renderActivityEditor(activity)).join("")}
    </div>
    ${renderPagination("picture", filteredActivities.length)}
  `;
}

function syncActivityList(): void {
  const activityList = root.querySelector<HTMLElement>("[data-activity-list]");
  if (!activityList) {
    return;
  }

  activityList.innerHTML = renderActivityList();
}

function renderMusicEditor(music: MusicAsset): string {
  return `
    <article class="asset-row music-row">
      <div class="music-badge">♪</div>
      <div class="asset-form">
        <label class="field">
          <span>音乐名称</span>
          <input type="text" value="${music.name}" data-music-name="${music.id}" />
        </label>
        <small>当前已绑定 ${music.activityIds.length} 张图片</small>
      </div>
      <button class="ghost-button danger-button" type="button" data-remove-music="${music.id}">移除</button>
    </article>
  `;
}

function renderMusicList(): string {
  const filteredMusics = state.musics.filter((music) => {
    const query = state.musicSearchQuery.trim().toLowerCase();
    return !query || music.name.toLowerCase().includes(query);
  });
  const pagedMusics = paginateItems(filteredMusics, state.pagers.music);
  state.pagers.music.page = pagedMusics.page;

  if (filteredMusics.length === 0) {
    return `<p class="empty-copy">没有匹配的音乐。</p>`;
  }

  return `
    <div class="asset-list">
      ${pagedMusics.items.map((music) => renderMusicEditor(music)).join("")}
    </div>
    ${renderPagination("music", filteredMusics.length)}
  `;
}

function syncMusicList(): void {
  const musicList = root.querySelector<HTMLElement>("[data-music-list]");
  if (!musicList) {
    return;
  }

  musicList.innerHTML = renderMusicList();
}

function renderAudioConfigCard(cue: AudioCueKey): string {
  const cueConfig = state.audio[cue];
  const clip = cueConfig.clip;
  const label = getAudioCueLabel(cue);
  const statusText = clip ? "已设置 1 条音频" : "当前未设置音频";

  return `
    <div class="audio-config-card">
      <label class="import-item theme-image-item">
        <div class="import-copy">
          <span>${label.title}</span>
          <small>${label.description}。${statusText}</small>
        </div>
        <input type="file" accept="audio/*" data-audio-cue="${cue}" />
        <em>选择音频</em>
      </label>
      <div class="audio-config-actions">
        <button class="ghost-button compact-action" type="button" data-action="preview-audio-cue" data-audio-cue="${cue}" ${clip ? "" : "disabled"}>
          试听
        </button>
        <button class="ghost-button compact-action" type="button" data-action="clear-audio-cue" data-audio-cue="${cue}" ${clip ? "" : "disabled"}>
          清除
        </button>
      </div>
      <label class="field audio-volume-field">
        <span>${label.title}音量</span>
        <div class="audio-volume-row">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value="${Math.round(cueConfig.volume * 100)}"
            data-audio-volume="${cue}"
          />
          <strong data-audio-volume-label="${cue}">${formatAudioVolumePercentage(cueConfig.volume)}</strong>
        </div>
      </label>
    </div>
  `;
}

function syncAudioConfigPanel(): void {
  const audioConfigGrid = root.querySelector<HTMLElement>("[data-audio-config-grid]");
  if (!audioConfigGrid) {
    return;
  }

  audioConfigGrid.innerHTML = AUDIO_CUE_KEYS.map((cue) => renderAudioConfigCard(cue)).join("");
}

function getFilteredMusicsForLinking(): MusicAsset[] {
  const query = state.musicManagerSearchQuery.trim().toLowerCase();
  return state.musics.filter((music) => !query || music.name.toLowerCase().includes(query));
}

function getPrioritizedUnlinkedMusics(musics: MusicAsset[], activityId: string): MusicAsset[] {
  return musics
    .filter((music) => !music.activityIds.includes(activityId))
    .sort((left, right) => {
      const leftUnused = left.activityIds.length === 0 ? 0 : 1;
      const rightUnused = right.activityIds.length === 0 ? 0 : 1;

      if (leftUnused !== rightUnused) {
        return leftUnused - rightUnused;
      }

      if (left.activityIds.length !== right.activityIds.length) {
        return left.activityIds.length - right.activityIds.length;
      }

      return left.name.localeCompare(right.name, "zh-CN");
    });
}

function renderLinkingList(): string {
  if (!state.linkingActivityId) {
    return "";
  }

  const filteredMusics = getFilteredMusicsForLinking();
  const linkedMusics = filteredMusics.filter((music) => music.activityIds.includes(state.linkingActivityId ?? ""));
  const unlinkedMusics = getPrioritizedUnlinkedMusics(filteredMusics, state.linkingActivityId);
  const pagedLinkedMusics = paginateItems(linkedMusics, state.pagers["music-manager-linked"]);
  const pagedUnlinkedMusics = paginateItems(unlinkedMusics, state.pagers["music-manager-unlinked"]);
  state.pagers["music-manager-linked"].page = pagedLinkedMusics.page;
  state.pagers["music-manager-unlinked"].page = pagedUnlinkedMusics.page;

  return `
    <section class="bench-section">
      <div class="section-head">
        <p class="eyebrow">Linked Music</p>
        <h3>当前已绑定音乐</h3>
      </div>
      ${
        linkedMusics.length === 0
          ? `<p class="empty-copy">当前还没有绑定任何音乐。</p>`
          : `
            <div class="linking-list">
              ${pagedLinkedMusics.items
                .map((music) => `
                  <div class="linking-item-shell">
                    <button class="linking-item is-linked" type="button" data-toggle-music-link="${music.id}">
                      <strong>${music.name}</strong>
                      <span>点击移除</span>
                    </button>
                    <button class="ghost-button compact-action" type="button" data-preview-music="${music.id}">
                      ${state.previewMusicId === music.id ? "关闭试听" : "试听"}
                    </button>
                  </div>
                `)
                .join("")}
            </div>
            ${renderPagination("music-manager-linked", linkedMusics.length)}
          `
      }
    </section>
    <section class="bench-section">
      <div class="section-head">
        <p class="eyebrow">Unlinked Music</p>
        <h3>从未绑定音乐中提取</h3>
      </div>
      ${
        unlinkedMusics.length === 0
          ? `<p class="empty-copy">当前没有可加入的音乐。</p>`
          : `
            <div class="linking-list">
              ${pagedUnlinkedMusics.items
                .map((music) => `
                  <div class="linking-item-shell">
                    <button class="linking-item" type="button" data-toggle-music-link="${music.id}">
                      <strong>${music.name}</strong>
                      <span>${music.activityIds.length === 0 ? "从未被引用，优先推荐" : `已被 ${music.activityIds.length} 张图片引用`}</span>
                    </button>
                    <button class="ghost-button compact-action" type="button" data-preview-music="${music.id}">
                      ${state.previewMusicId === music.id ? "关闭试听" : "试听"}
                    </button>
                  </div>
                `)
                .join("")}
            </div>
            ${renderPagination("music-manager-unlinked", unlinkedMusics.length)}
          `
      }
    </section>
  `;
}

function syncLinkingList(): void {
  const linkingList = root.querySelector<HTMLElement>("[data-linking-list]");
  if (!linkingList || !state.linkingActivityId) {
    return;
  }

  linkingList.innerHTML = renderLinkingList();
}

function syncWorkbenchAssetViews(): void {
  syncActivityList();
  syncMusicList();
  syncLinkingList();
}

function renderLinkingPanel(): string {
  if (!state.linkingActivityId) {
    return "";
  }

  const activity = state.activities.find((item) => item.id === state.linkingActivityId);
  if (!activity) {
    return "";
  }

  return `
    <div class="modal-shell secondary-modal">
      <div class="modal-backdrop" data-action="close-music-manager"></div>
      <section class="workbench-modal music-manager-modal" role="dialog" aria-modal="true" aria-label="图片音乐管理">
        <div class="modal-head">
          <div>
            <p class="eyebrow">Link Music</p>
            <h2>${activity.name}</h2>
          </div>
          <button class="ghost-button" type="button" data-action="close-music-manager">关闭</button>
        </div>
        <div class="modal-body">
          <p class="section-copy">为这张${getPictureKindLabel(activity.kind)}搜索并勾连音乐。再次点击已添加的项可移除。</p>
          <label class="import-item inline-import-item">
            <div class="import-copy">
              <span>当场导入音乐并绑定</span>
              <small>支持多选，导入后自动绑定到当前图片</small>
            </div>
            <input type="file" accept="audio/*" multiple data-input="music-files-link" />
            <em>选择音频</em>
          </label>
          <label class="field">
            <span>搜索音乐</span>
            <input type="search" value="${state.musicManagerSearchQuery}" placeholder="输入音乐名称过滤" data-music-manager-search />
          </label>
          <div class="linking-list-shell" data-linking-list>${renderLinkingList()}</div>
        </div>
      </section>
    </div>
  `;
}

function renderWorkbenchModal(): string {
  if (!state.isWorkbenchOpen) {
    return "";
  }

  return `
    <div class="modal-shell">
      <div class="modal-backdrop" data-action="close-workbench"></div>
      <section class="workbench-modal" role="dialog" aria-modal="true" aria-label="听音乐选图片工作台">
        <div class="modal-head">
          <div>
            <p class="eyebrow">Workbench</p>
            <h2>活动图、音乐与主题</h2>
          </div>
          <button class="ghost-button" type="button" data-action="close-workbench">关闭</button>
        </div>

        <div class="modal-body">
          <section class="bench-section">
            <div class="section-head">
              <p class="eyebrow">Assets</p>
              <h3>素材包、活动图与音乐</h3>
            </div>
            <div class="pack-row">
              <button class="ghost-button" type="button" data-action="export-pack">导出素材包</button>
              <label class="import-item pack-import-item">
                <div class="import-copy">
                  <span>导入素材包</span>
                  <small>读取 zip 内配置、图片与音乐</small>
                </div>
                <input type="file" accept=".zip,application/zip" data-pack-input="workspace" />
                <em>选择文件</em>
              </label>
            </div>
            <div class="import-grid">
              <label class="import-item">
                <div class="import-copy">
                  <span>导入图片</span>
                  <small>支持多选，默认标记为未分类，可后续改成活动图、角色图或总力战图</small>
                </div>
                <input type="file" accept="image/*" multiple data-input="activity-files" />
                <em>选择文件</em>
              </label>
              <label class="import-item">
                <div class="import-copy">
                  <span>导入音乐</span>
                  <small>支持多选音频</small>
                </div>
                <input type="file" accept="audio/*" multiple data-input="music-files" />
                <em>选择文件</em>
              </label>
            </div>
            <div class="asset-column">
              <div class="subsection-head">
                <h4>${state.assetBankTab === "picture" ? "图片列表" : "音乐列表"}</h4>
                <button class="ghost-button compact-action" type="button" data-action="reset-demo">恢复演示素材</button>
              </div>
              <div class="play-kind-switch">
                <button class="ghost-button compact-action ${state.assetBankTab === "picture" ? "is-active-filter" : ""}" type="button" data-action="set-bank-picture">图片仓</button>
                <button class="ghost-button compact-action ${state.assetBankTab === "music" ? "is-active-filter" : ""}" type="button" data-action="set-bank-music">音乐仓</button>
              </div>
              ${
                state.assetBankTab === "picture"
                  ? `
                    <div class="play-kind-switch">
                      <button class="ghost-button compact-action ${state.activityFilterMode === "all" ? "is-active-filter" : ""}" type="button" data-action="filter-activity-all">全部图片</button>
                      <button class="ghost-button compact-action ${state.activityFilterMode === "uncategorized" ? "is-active-filter" : ""}" type="button" data-action="filter-activity-uncategorized">只看未分类</button>
                    </div>
                    <label class="field">
                      <span>搜索图片</span>
                      <input type="search" value="${state.activitySearchQuery}" placeholder="输入图片名称过滤" data-activity-search />
                    </label>
                    <div data-activity-list>
                      ${renderActivityList()}
                    </div>
                  `
                  : `
                    <p class="section-copy">音乐区只负责上传、命名和移除。图片与音乐的关系，请在图片仓里点击单张图片后管理。</p>
                    <label class="field">
                      <span>搜索音乐</span>
                      <input type="search" value="${state.musicSearchQuery}" placeholder="输入音乐名称过滤" data-music-search-global />
                    </label>
                    <div data-music-list>
                      ${renderMusicList()}
                    </div>
                  `
              }
            </div>
          </section>

          <section class="bench-section">
            <div class="section-head">
              <p class="eyebrow">Rules</p>
              <h3>游戏参数</h3>
            </div>
            <div class="config-grid">
              <label class="field">
                <span>外部控件总宽度</span>
                <input type="number" min="1" value="${state.config.shellWidth}" data-config-key="shellWidth" />
              </label>
              <label class="field">
                <span>图片宽度</span>
                <input type="number" min="1" value="${state.config.cardWidth}" data-config-key="cardWidth" />
              </label>
              <label class="field">
                <span>图片高度</span>
                <input type="number" min="1" value="${state.config.cardHeight}" data-config-key="cardHeight" />
              </label>
              <label class="field">
                <span>最多解压图片数</span>
                <input type="number" min="4" value="${state.config.maxDecodedPictures}" data-config-key="maxDecodedPictures" />
              </label>
              <label class="field">
                <span>最多解压音乐数</span>
                <input type="number" min="1" value="${state.config.maxDecodedMusics}" data-config-key="maxDecodedMusics" />
              </label>
            </div>
          </section>

          <section class="bench-section">
            <div class="section-head">
              <p class="eyebrow">Audio</p>
              <h3>挑战音乐与音效</h3>
            </div>
            <p class="section-copy">挑战音乐单独控制音量。点击、成功、失败三种音效会与当前挑战音乐并行播放，并跟随素材包导入导出。</p>
            <label class="field audio-volume-field">
              <span>挑战音乐音量</span>
              <div class="audio-volume-row">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value="${Math.round(state.musicVolume * 100)}"
                  data-music-volume="round"
                />
                <strong data-music-volume-label>${formatAudioVolumePercentage(state.musicVolume)}</strong>
              </div>
            </label>
            <div class="audio-config-grid" data-audio-config-grid>
              ${AUDIO_CUE_KEYS.map((cue) => renderAudioConfigCard(cue)).join("")}
            </div>
          </section>

          <section class="bench-section">
            <div class="section-head">
              <p class="eyebrow">Theme</p>
              <h3>界面颜色与背景</h3>
            </div>
            <div class="config-grid">
              <label class="field color-field"><span>App 主色</span><input type="color" value="${state.theme.appColor}" data-theme-key="appColor" /></label>
              <label class="field color-field"><span>标题字色</span><input type="color" value="${state.theme.headingColor}" data-theme-key="headingColor" /></label>
              <label class="field color-field"><span>说明字色</span><input type="color" value="${state.theme.mutedTextColor}" data-theme-key="mutedTextColor" /></label>
              <label class="field color-field"><span>弱提示字色</span><input type="color" value="${state.theme.softTextColor}" data-theme-key="softTextColor" /></label>
              <label class="field color-field"><span>主按钮字色</span><input type="color" value="${state.theme.buttonTextColor}" data-theme-key="buttonTextColor" /></label>
              <label class="field color-field"><span>Ghost 按钮色</span><input type="color" value="${state.theme.ghostButtonColor}" data-theme-key="ghostButtonColor" /></label>
              <label class="field color-field"><span>主高亮色</span><input type="color" value="${state.theme.accentColor}" data-theme-key="accentColor" /></label>
              <label class="field color-field"><span>面板底色</span><input type="color" value="${state.theme.panelTint}" data-theme-key="panelTint" /></label>
              <label class="field color-field"><span>背景起始色</span><input type="color" value="${state.theme.backgroundStart}" data-theme-key="backgroundStart" /></label>
              <label class="field color-field"><span>背景结束色</span><input type="color" value="${state.theme.backgroundEnd}" data-theme-key="backgroundEnd" /></label>
              <label class="field color-field"><span>正确提示色</span><input type="color" value="${state.theme.correctColor}" data-theme-key="correctColor" /></label>
              <label class="field color-field"><span>错误提示色</span><input type="color" value="${state.theme.wrongColor}" data-theme-key="wrongColor" /></label>
            </div>
            <div class="theme-image-row">
              <label class="import-item theme-image-item">
                <div class="import-copy">
                  <span>App 背景图片</span>
                  <small>${state.theme.backgroundImage ? "已加载 1 张背景图" : "当前未设置背景图"}</small>
                </div>
                <input type="file" accept="image/*" data-theme-image="background" />
                <em>选择图片</em>
              </label>
              <button class="ghost-button" type="button" data-action="clear-theme-background">清除背景图</button>
            </div>
          </section>
        </div>
      </section>
    </div>
  `;
}

function renderStage(): string {
  if (!state.round || state.phase === "setup") {
    return `
      <section class="stage idle-stage">
        <div class="stage-copy">
          <p class="eyebrow">Music Guess</p>
          <h2>听一段音乐，判断它属于哪张${getPictureKindLabel(state.selectedPlayKind)}</h2>
          <p>开始后会随机给出 4 张${getPictureKindLabel(state.selectedPlayKind)}，并播放一段音乐。你只需要选图并提交。</p>
        </div>
      </section>
    `;
  }

  return `
    <section class="stage">
      <div class="stage-head">
        <div>
          <p class="eyebrow">Active Round</p>
          <h2>${state.phase === "reviewed" ? "判题完成" : "听音乐选图中"}</h2>
        </div>
        <div class="stage-stats">
          <span>图片 4</span>
          <span>音乐 1</span>
          <span>${state.phase === "reviewed" ? "已结束" : "进行中"}</span>
        </div>
      </div>

      <div class="audio-hub">
        <div class="audio-copy">
          <span class="audio-kicker">当前音频</span>
          <strong>请根据旋律判断对应${getPictureKindLabel(state.selectedPlayKind)}</strong>
          <small>${state.isAudioPlaying ? "播放中" : "待播放 / 已暂停"}</small>
        </div>
        <div class="audio-actions">
          <button class="ghost-button" type="button" data-action="replay-audio">重新播放</button>
        </div>
      </div>

      <div class="selection-chip ${state.selectedActivityId ? "is-active" : ""}">
        ${
          state.phase === "reviewed"
            ? `<span>判题后试听</span><strong>点击任意图片播放它已绑定的音乐</strong><small>正确图片会优先播放本题对应音乐</small>`
            : state.selectedActivityId
            ? `<span>当前选择</span><strong>${state.round.activities.find((activity) => activity.id === state.selectedActivityId)?.name ?? ""}</strong><small>确认后点击右下角提交</small>`
            : `<span>等待选择</span><strong>先播放音乐，再选一张${getPictureKindLabel(state.selectedPlayKind)}</strong><small>本局只有一张提交结果</small>`
        }
      </div>

      <div class="activity-grid" style="--card-width: ${state.config.cardWidth}px; --card-height: ${state.config.cardHeight}px;">
        ${state.round.activities
          .map((activity) => {
            const isSelected = state.selectedActivityId === activity.id;
            const isCorrect =
              state.phase === "reviewed" && state.round?.correctActivityIds.includes(activity.id);
            const isWrong =
              state.phase === "reviewed" &&
              state.selectedActivityId === activity.id &&
              !state.round?.correctActivityIds.includes(activity.id);
            const stateClass = isCorrect ? "is-correct" : isWrong ? "is-wrong" : "";

            return `
              <button class="activity-card ${isSelected ? "is-selected" : ""} ${stateClass}" type="button" data-activity-id="${activity.id}">
                <img src="${activity.src}" alt="${activity.name}" loading="lazy" />
                <div class="activity-overlay">
                  <strong>${activity.name}</strong>
                </div>
              </button>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function render(): void {
  root.innerHTML = `
    <main class="music-shell" style="--shell-width: ${state.config.shellWidth}px;">
      <header class="game-topbar">
        <div class="topbar-copy">
          <a class="back-link" href="/">返回首页</a>
          <p class="eyebrow">Single-Player Local Web Game</p>
          <h1>听音乐选图片</h1>
        </div>
        <div class="topbar-actions">
          <div class="play-kind-switch">
            <button class="ghost-button compact-action ${state.selectedPlayKind === "activity" ? "is-active-filter" : ""}" type="button" data-action="set-play-kind-activity">活动图模式</button>
            <button class="ghost-button compact-action ${state.selectedPlayKind === "chara" ? "is-active-filter" : ""}" type="button" data-action="set-play-kind-chara">角色图模式</button>
            <button class="ghost-button compact-action ${state.selectedPlayKind === "raid" ? "is-active-filter" : ""}" type="button" data-action="set-play-kind-raid">总力战图模式</button>
          </div>
          <button class="ghost-button" type="button" data-action="open-workbench">工作台</button>
          <button class="primary-button" type="button" data-action="start-game">开始游戏</button>
        </div>
      </header>

      <section class="game-screen">
        <div class="notice notice-${state.notice.tone}" data-notice>
          <p>${state.notice.text}</p>
        </div>
        ${renderStage()}
      </section>

      <div class="floating-actions">
        <button
          class="floating-action floating-action-secondary ${state.phase === "setup" ? "is-dimmed" : ""}"
          type="button"
          data-action="toggle-audio"
          aria-label="${state.isAudioPlaying ? "暂停音乐" : "播放音乐"}"
          ${state.phase === "setup" ? "disabled" : ""}
        >
          <span>${state.isAudioPlaying ? "暂停" : "播放"}</span>
        </button>
        <button
          class="floating-action floating-action-secondary ${state.phase === "setup" ? "is-dimmed" : ""}"
          type="button"
          data-action="restart-game"
          aria-label="重新抽题"
          ${state.phase === "setup" ? "disabled" : ""}
        >
          <span>重开</span>
        </button>
        <button
          class="floating-action floating-action-primary ${state.phase === "reviewed" ? "is-dimmed" : ""}"
          type="button"
          data-action="${state.phase === "setup" ? "start-game" : "submit-answer"}"
          aria-label="${state.phase === "setup" ? "开始游戏" : "提交答案"}"
          ${state.phase === "reviewed" ? "disabled" : ""}
        >
          <span>${state.phase === "setup" ? "开始" : "提交"}</span>
        </button>
      </div>

      ${renderWorkbenchModal()}
      ${renderLinkingPanel()}
    </main>
  `;

  applyTheme();
  syncBoardSizing();
}

root.addEventListener("click", (event) => {
  void unlockAudioPlayback();
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const actionButton = target.closest<HTMLElement>("[data-action]");
  const activityButton = target.closest<HTMLElement>("[data-activity-id]");
  const removeActivityButton = target.closest<HTMLElement>("[data-remove-activity]");
  const removeMusicButton = target.closest<HTMLElement>("[data-remove-music]");
  const linkActivityButton = target.closest<HTMLElement>("[data-link-activity]");
  const toggleMusicLinkButton = target.closest<HTMLElement>("[data-toggle-music-link]");
  const previewMusicButton = target.closest<HTMLElement>("[data-preview-music]");
  const pageNavButton = target.closest<HTMLElement>("[data-page-nav]");

  if (activityButton?.dataset.activityId) {
    void playAudioCue("click");
    selectActivity(activityButton.dataset.activityId);
    return;
  }

  if (removeActivityButton?.dataset.removeActivity) {
    removeActivity(removeActivityButton.dataset.removeActivity);
    return;
  }

  if (removeMusicButton?.dataset.removeMusic) {
    removeMusic(removeMusicButton.dataset.removeMusic);
    return;
  }

  if (linkActivityButton?.dataset.linkActivity) {
    setLinkingActivity(
      state.linkingActivityId === linkActivityButton.dataset.linkActivity
        ? null
        : linkActivityButton.dataset.linkActivity,
    );
    return;
  }

  if (toggleMusicLinkButton?.dataset.toggleMusicLink && state.linkingActivityId) {
    toggleMusicActivityLink(state.linkingActivityId, toggleMusicLinkButton.dataset.toggleMusicLink);
    syncWorkbenchAssetViews();
    return;
  }

  if (previewMusicButton?.dataset.previewMusic) {
    void togglePreviewMusic(previewMusicButton.dataset.previewMusic);
    return;
  }

  if (
    pageNavButton?.dataset.pageNav &&
    pageNavButton.dataset.pageTarget &&
    (
      pageNavButton.dataset.pageNav === "picture" ||
      pageNavButton.dataset.pageNav === "music" ||
      pageNavButton.dataset.pageNav === "music-manager-linked" ||
      pageNavButton.dataset.pageNav === "music-manager-unlinked"
    )
  ) {
    updatePagerPage(
      pageNavButton.dataset.pageNav,
      Number(pageNavButton.dataset.pageTarget),
    );
    return;
  }

  switch (actionButton?.dataset.action) {
    case "open-workbench":
      openWorkbench();
      break;
    case "close-workbench":
      closeWorkbench();
      break;
    case "start-game":
      void startGame();
      break;
    case "set-play-kind-activity":
      updateSelectedPlayKind("activity");
      break;
    case "set-play-kind-chara":
      updateSelectedPlayKind("chara");
      break;
    case "set-play-kind-raid":
      updateSelectedPlayKind("raid");
      break;
    case "set-bank-picture":
      switchAssetBankTab("picture");
      break;
    case "set-bank-music":
      switchAssetBankTab("music");
      break;
    case "filter-activity-all":
      updateActivityFilterMode("all");
      syncActivityList();
      break;
    case "filter-activity-uncategorized":
      updateActivityFilterMode("uncategorized");
      syncActivityList();
      break;
    case "restart-game":
      restartGame();
      break;
    case "toggle-audio":
      void toggleAudioPlayback();
      break;
    case "replay-audio":
      replayAudio();
      break;
    case "submit-answer":
      void submitAnswer();
      break;
    case "preview-audio-cue":
      if (
        actionButton instanceof HTMLElement &&
        actionButton.dataset.audioCue &&
        (
          actionButton.dataset.audioCue === "click" ||
          actionButton.dataset.audioCue === "success" ||
          actionButton.dataset.audioCue === "failure"
        )
      ) {
        void playAudioCue(actionButton.dataset.audioCue);
      }
      break;
    case "clear-audio-cue":
      if (
        actionButton instanceof HTMLElement &&
        actionButton.dataset.audioCue &&
        (
          actionButton.dataset.audioCue === "click" ||
          actionButton.dataset.audioCue === "success" ||
          actionButton.dataset.audioCue === "failure"
        )
      ) {
        clearAudioCue(actionButton.dataset.audioCue);
      }
      break;
    case "export-pack":
      void exportWorkspacePack();
      break;
    case "clear-theme-background":
      clearThemeBackgroundImage();
      break;
    case "reset-demo":
      stopAllManagedAudio();
      revokeAssetUrls(state.activities);
      revokeAssetUrls(state.musics);
      releaseThemeBackgroundImage();
      state.activities = createDemoActivities();
      state.musics = createDemoMusics();
      state.musicVolume = DEFAULT_MUSIC_VOLUME;
      state.audio = createDefaultAudioConfig();
      state.theme = { ...DEFAULT_THEME };
      state.themeBackgroundStorageKey = null;
      state.themeBackgroundMimeType = null;
      state.themeBackgroundStored = false;
      state.config = { ...DEFAULT_CONFIG };
      state.phase = "setup";
      state.round = null;
      state.selectedActivityId = null;
      state.previewMusicId = null;
      state.isAudioPlaying = false;
      state.activityFilterMode = "all";
      state.hydratedActivityIds = [];
      state.hydratedMusicIds = [];
      applyTheme();
      void persistWorkspace();
      setNotice("success", "已恢复演示图片、音乐和默认主题。");
      render();
      break;
    case "close-music-manager":
      setLinkingActivity(null);
      break;
    default:
      break;
  }
});

root.addEventListener("pointerdown", () => {
  void unlockAudioPlayback();
});

root.addEventListener("change", (event) => {
  const target = event.target;

  if (target instanceof HTMLInputElement && target.dataset.input === "activity-files" && target.files) {
    importActivityFiles(target.files);
    target.value = "";
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.input === "music-files" && target.files) {
    importMusicFiles(target.files);
    target.value = "";
    return;
  }

  if (
    target instanceof HTMLInputElement &&
    target.dataset.input === "music-files-link" &&
    target.files &&
    state.linkingActivityId
  ) {
    importMusicFilesForActivity(target.files, state.linkingActivityId);
    target.value = "";
    return;
  }

  if (
    target instanceof HTMLInputElement &&
    target.dataset.audioCue &&
    target.files &&
    (
      target.dataset.audioCue === "click" ||
      target.dataset.audioCue === "success" ||
      target.dataset.audioCue === "failure"
    )
  ) {
    void updateAudioCue(target.dataset.audioCue, target.files);
    target.value = "";
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.packInput === "workspace" && target.files) {
    void importWorkspacePack(target.files);
    target.value = "";
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.configKey) {
    updateConfigValue(target.dataset.configKey as keyof GameConfig, target.value);
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.themeKey) {
    updateThemeValue(target.dataset.themeKey as keyof ThemeConfig, target.value);
    return;
  }

  if (
    target instanceof HTMLInputElement &&
    target.dataset.audioVolume &&
    (
      target.dataset.audioVolume === "click" ||
      target.dataset.audioVolume === "success" ||
      target.dataset.audioVolume === "failure"
    )
  ) {
    updateAudioCueVolume(target.dataset.audioVolume, target.value);
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.musicVolume === "round") {
    updateMusicVolume(target.value);
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.themeImage === "background" && target.files) {
    updateThemeBackgroundImage(target.files);
    target.value = "";
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.activityName) {
    updateActivityName(target.dataset.activityName, target.value);
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.musicSearchGlobal !== undefined) {
    updateMusicSearchQuery(target.value);
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.musicManagerSearch !== undefined) {
    updateMusicManagerSearchQuery(target.value);
    syncLinkingList();
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.activitySearch !== undefined) {
    updateActivitySearchQuery(target.value);
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.musicName) {
    updateMusicName(target.dataset.musicName, target.value);
    return;
  }

  if (target instanceof HTMLSelectElement && target.dataset.activityKind) {
    updateActivityKind(target.dataset.activityKind, target.value as PictureKind);
  }
});

root.addEventListener("input", (event) => {
  const target = event.target;

  if (target instanceof HTMLInputElement && target.dataset.activitySearch !== undefined) {
    updateActivitySearchQuery(target.value);
    syncActivityList();
  }

  if (target instanceof HTMLInputElement && target.dataset.musicManagerSearch !== undefined) {
    updateMusicManagerSearchQuery(target.value);
    syncLinkingList();
  }

  if (target instanceof HTMLInputElement && target.dataset.musicSearchGlobal !== undefined) {
    updateMusicSearchQuery(target.value);
    render();
  }

  if (
    target instanceof HTMLInputElement &&
    target.dataset.audioVolume &&
    (
      target.dataset.audioVolume === "click" ||
      target.dataset.audioVolume === "success" ||
      target.dataset.audioVolume === "failure"
    )
  ) {
    const volumeLabel = root.querySelector<HTMLElement>(`[data-audio-volume-label="${target.dataset.audioVolume}"]`);
    if (volumeLabel) {
      volumeLabel.textContent = formatAudioVolumePercentage(Number(target.value) / 100);
    }
  }

  if (target instanceof HTMLInputElement && target.dataset.musicVolume === "round") {
    const volumeLabel = root.querySelector<HTMLElement>("[data-music-volume-label]");
    if (volumeLabel) {
      volumeLabel.textContent = formatAudioVolumePercentage(Number(target.value) / 100);
    }
  }
});

window.addEventListener("beforeunload", () => {
  stopAllManagedAudio();
});

async function initialize(): Promise<void> {
  const restored = await restoreWorkspace();
  if (!restored) {
    state.activities = createDemoActivities();
    state.musics = createDemoMusics();
  }

  render();
}

void initialize();
