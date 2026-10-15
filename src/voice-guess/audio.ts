// 音频管理模块：Web Audio API 解锁与合成 + Web Speech 日语台词朗读 + 角色真实音频/语音包 (IndexedDB) 支持

import type { StudentProfile } from "./types";

let audioCtx: AudioContext | null = null;
let currentAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let isAudioPlaying = false;
let audioUnlocked = false;
let sfxVolume = 0.7;
let voiceVolume = 0.9;
let onPlayStateChangeCallback: ((playing: boolean) => void) | null = null;

// 本地 IndexedDB 音频缓存
const VOICE_DB_NAME = "bagame-voice-guess";
const VOICE_STORE_NAME = "studentVoices";
let customVoiceBlobs = new Map<string, Blob>();
let customVoiceObjectUrls = new Map<string, string>();

/**
 * 获取或初始化 AudioContext
 */
export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * 在任何用户交互（点击、按键）中显式解锁浏览器音频播放权限
 */
export function unlockAudio(): boolean {
  if (audioUnlocked) return true;

  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    audioUnlocked = true;
    return true;
  } catch {
    return false;
  }
}

export function isAudioUnlocked(): boolean {
  return audioUnlocked;
}

export function subscribeVoicePlaybackState(cb: (playing: boolean) => void): () => void {
  onPlayStateChangeCallback = cb;
  return () => {
    onPlayStateChangeCallback = null;
  };
}

function setPlayingState(playing: boolean): void {
  isAudioPlaying = playing;
  if (onPlayStateChangeCallback) {
    onPlayStateChangeCallback(playing);
  }
}

export function setSfxVolume(vol: number): void {
  sfxVolume = Math.max(0, Math.min(1, vol));
}

export function setVoiceVolume(vol: number): void {
  voiceVolume = Math.max(0, Math.min(1, vol));
  if (currentAudio) {
    currentAudio.volume = voiceVolume;
  }
}

export function getVoicePlaying(): boolean {
  return isAudioPlaying;
}

/**
 * 播放 UI 交互音效 (完全通过 Web Audio API 振荡器算法合成)
 */
export function playSfx(type: "click" | "correct" | "wrong" | "streak"): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(sfxVolume, now);
    masterGain.connect(ctx.destination);

    if (type === "click") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.06);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === "correct") {
      // 欢快上扬琶音 (E5 -> G#5 -> B5 -> E6)
      const notes = [659.25, 830.61, 987.77, 1318.51];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const noteStart = now + idx * 0.06;

        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, noteStart);

        gain.gain.setValueAtTime(0, noteStart);
        gain.gain.linearRampToValueAtTime(0.4, noteStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.28);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(noteStart);
        osc.stop(noteStart + 0.3);
      });
    } else if (type === "wrong") {
      // 错误提示重音 (降调锯齿波)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.22);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.26);
    } else if (type === "streak") {
      // 连击达成音
      const chords = [523.25, 659.25, 783.99, 1046.5];
      chords.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.65);
      });
    }
  } catch (err) {
    console.warn("Play SFX notice:", err);
  }
}

/**
 * 停止当前正在播放的声音或语音朗读
 */
export function stopVoice(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = null;
  setPlayingState(false);
}

/**
 * 检查当前系统与浏览器是否具有可用的日语 TTS 语音
 */
export async function getJapaneseTtsVoice(): Promise<SpeechSynthesisVoice | null> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }

  const synth = window.speechSynthesis;
  let voices = synth.getVoices();

  if (voices.length === 0) {
    // 异步等待浏览器加载语音列表
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 400);
      synth.onvoiceschanged = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    voices = synth.getVoices();
  }

  // 优先匹配高质量日语女性语音（如 Edge 的 Microsoft Nanami Online, 或 Kyoko, Ayumi, Haruka）
  const jaVoice =
    voices.find(
      (v) =>
        v.lang.toLowerCase().replace("_", "-").startsWith("ja") &&
        (v.name.toLowerCase().includes("nanami") ||
          v.name.toLowerCase().includes("online") ||
          v.name.toLowerCase().includes("natural") ||
          v.name.toLowerCase().includes("ayumi") ||
          v.name.toLowerCase().includes("haruka") ||
          v.name.toLowerCase().includes("female")),
    ) || voices.find((v) => v.lang.toLowerCase().replace("_", "-").startsWith("ja"));

  return jaVoice || null;
}

/**
 * 当系统既没有音频文件又没有日语 TTS 语音时，播放特色技能音律（确保用户绝对不会遇到“完全静音”的糟糕体验）
 */
function playFallbackMelody(onEnd: () => void): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) {
      setTimeout(onEnd, 1000);
      return;
    }

    const now = ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5 战斗集结和弦
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * 0.12;

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + 0.45);
    });

    setTimeout(onEnd, 1200);
  } catch {
    setTimeout(onEnd, 800);
  }
}

/**
 * 转换静态资源相对路径，自适应兼容 /voice-guess/ 与 /games/voice-guess/ 多级路由
 */
export function resolveAssetUrl(relPath: string): string {
  if (!relPath) return "";
  if (
    relPath.startsWith("http://") ||
    relPath.startsWith("https://") ||
    relPath.startsWith("data:") ||
    relPath.startsWith("blob:")
  ) {
    return relPath;
  }
  const cleanPath = relPath.replace(/^\/+/, "");
  if (typeof window === "undefined") return cleanPath;
  const pathname = window.location.pathname;
  const isGamesNested = pathname.includes("/games/voice-guess/") || pathname.includes("/games/");
  const prefix = isGamesNested ? "../../" : "../";
  return `${prefix}${cleanPath}`;
}

/**
 * 播放角色语音的核心逻辑：
 * 1. 优先播放自定义导入的音频 (IndexedDB)；
 * 2. 次选本地预置的官方高质量原声切片 (`public/voices/${student.id}_${mode}.ogg`)；
 * 3. 若本地离线未命中，自动调用基沃托斯古书馆官方 CDN 原声切片；
 * 4. 若网络与音频均异常，降级至 Web Speech API 日语语音朗读；
 * 5. 极端情况下播放特色技能音律，确保绝不死锁或静音！
 */
export async function playVoice(
  student: StudentProfile,
  lineJp: string,
  audioUrl?: string,
  mode: "ex" | "daily" = "ex",
  onComplete?: () => void,
): Promise<void> {
  stopVoice();
  setPlayingState(true);

  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    setPlayingState(false);
    if (onComplete) onComplete();
  };

  // 构建音频候选用例链
  const candidateUrls: string[] = [];

  // 1. 用户自定义上传语音优先 (支持模式专属音频 studentId_mode、studentId 或 alias)
  const customModeUrl = getCustomVoiceUrl(`${student.id}_${mode}`);
  const customIdUrl = getCustomVoiceUrl(student.id);
  const customAliasUrl = getCustomVoiceUrl(student.alias);
  if (customModeUrl) {
    candidateUrls.push(customModeUrl);
  } else if (customIdUrl) {
    candidateUrls.push(customIdUrl);
  } else if (customAliasUrl) {
    candidateUrls.push(customAliasUrl);
  }

  // 2. 传入的指定 audioUrl (如 voices/${student.id}_${mode}.ogg)
  if (audioUrl) {
    candidateUrls.push(resolveAssetUrl(audioUrl));
  }

  // 3. 项目本地内置的高清原声切片
  candidateUrls.push(resolveAssetUrl(`voices/${student.id}_${mode}.ogg`));

  // 4. 基沃托斯古书馆 (kivo.wiki) 官方原声切片 CDN 备份 (确保音字绝对对齐)
  const voiceObj = mode === "daily" ? student.dailyVoice : student.exVoice;
  if (voiceObj && voiceObj.remoteAudio) {
    candidateUrls.push(voiceObj.remoteAudio);
  }

  // 5. 旧版 EX 技能单文件兜底 (仅在 EX 模式下)
  if (mode === "ex") {
    candidateUrls.push(resolveAssetUrl(`voices/${student.id}.ogg`));
  }

  let candidateIdx = 0;

  function tryNextAudioCandidate(): void {
    if (candidateIdx >= candidateUrls.length) {
      // 所有音频源均未命中或失败，降级至语音合成
      currentAudio = null;
      trySpeechSynthesis(lineJp, finish);
      return;
    }

    const currentUrl = candidateUrls[candidateIdx];
    candidateIdx += 1;

    try {
      const audio = new Audio(currentUrl);
      currentAudio = audio;
      audio.volume = voiceVolume;

      audio.onended = () => finish();
      audio.onerror = () => {
        tryNextAudioCandidate();
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          tryNextAudioCandidate();
        });
      }
    } catch {
      tryNextAudioCandidate();
    }
  }

  tryNextAudioCandidate();
}

async function trySpeechSynthesis(lineJp: string, onEnd: () => void): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    playFallbackMelody(onEnd);
    return;
  }

  const jaVoice = await getJapaneseTtsVoice();
  if (!jaVoice) {
    // 明确提示并使用旋律
    console.info("未检测到本地日语 TTS 语音包，已自动降级为音律提示。可通过导入音频包获得角色原声。");
    playFallbackMelody(onEnd);
    return;
  }

  try {
    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(lineJp);
    currentUtterance = utterance;

    utterance.voice = jaVoice;
    utterance.lang = "ja-JP";
    utterance.volume = voiceVolume;
    utterance.rate = 1.05;
    utterance.pitch = 1.15;

    utterance.onend = () => onEnd();
    utterance.onerror = () => {
      playFallbackMelody(onEnd);
    };

    synth.speak(utterance);
  } catch {
    playFallbackMelody(onEnd);
  }
}

/**
 * -----------------------------------------------------------------------------
 * IndexedDB 角色音频包存储与管理
 * -----------------------------------------------------------------------------
 */

function openVoiceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(VOICE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VOICE_STORE_NAME)) {
        db.createObjectStore(VOICE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open voice database."));
  });
}

export function getCustomVoiceUrl(key: string): string | null {
  const normalized = key.toLowerCase().trim();
  return customVoiceObjectUrls.get(normalized) || null;
}

export function getLoadedCustomVoiceCount(): number {
  return customVoiceBlobs.size;
}

/**
 * 初始化并从 IndexedDB 加载已保存的角色音频
 */
export async function initVoiceStorage(): Promise<number> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return 0;
  }

  try {
    const db = await openVoiceDatabase();
    const transaction = db.transaction(VOICE_STORE_NAME, "readonly");
    const store = transaction.objectStore(VOICE_STORE_NAME);

    const keysRequest = store.getAllKeys();
    const valuesRequest = store.getAll();

    await new Promise<void>((resolve) => {
      let done = 0;
      const checkDone = () => {
        done += 1;
        if (done >= 2) resolve();
      };
      keysRequest.onsuccess = checkDone;
      valuesRequest.onsuccess = checkDone;
      keysRequest.onerror = () => resolve();
      valuesRequest.onerror = () => resolve();
      setTimeout(resolve, 300);
    });

    const keys = (keysRequest.result as string[]) || [];
    const values = (valuesRequest.result as Blob[]) || [];

    customVoiceBlobs.clear();
    customVoiceObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    customVoiceObjectUrls.clear();

    keys.forEach((key, index) => {
      const blob = values[index];
      if (blob) {
        customVoiceBlobs.set(key.toLowerCase(), blob);
        customVoiceObjectUrls.set(key.toLowerCase(), URL.createObjectURL(blob));
      }
    });

    db.close();
    return customVoiceBlobs.size;
  } catch (err) {
    console.warn("Init voice storage notice:", err);
    return 0;
  }
}

/**
 * 导入自定义语音压缩包 (.zip)
 * 支持将任何包含角色名 (如 shiroko.mp3, hoshino.ogg, 砂狼白子.mp3) 的压缩包解压并持久化至 IndexedDB
 */
export async function importVoiceZipPack(
  file: File,
  onProgress?: (current: number, total: number) => void,
): Promise<{ successCount: number; matchedStudents: string[] }> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(file);

  const audioEntries: Array<{ name: string; file: ReturnType<typeof zip.file> }> = [];
  zip.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir && /\.(mp3|ogg|wav|m4a|aac)$/i.test(relativePath)) {
      audioEntries.push({ name: relativePath, file: zipEntry });
    }
  });

  if (audioEntries.length === 0) {
    throw new Error("压缩包内未找到有效的音频文件（支持 .mp3, .ogg, .wav, .m4a）");
  }

  const db = await openVoiceDatabase();
  const transaction = db.transaction(VOICE_STORE_NAME, "readwrite");
  const store = transaction.objectStore(VOICE_STORE_NAME);

  const matchedStudents: string[] = [];
  let processed = 0;

  for (const entry of audioEntries) {
    if (!entry.file) continue;

    const baseName = entry.name.split("/").pop()?.split(".")[0]?.toLowerCase().trim() || "";
    if (!baseName) continue;

    const blob = await entry.file.async("blob");
    const mimeType = entry.name.endsWith(".ogg")
      ? "audio/ogg"
      : entry.name.endsWith(".wav")
      ? "audio/wav"
      : "audio/mpeg";

    const typedBlob = new Blob([blob], { type: mimeType });

    store.put(typedBlob, baseName);
    customVoiceBlobs.set(baseName, typedBlob);
    customVoiceObjectUrls.set(baseName, URL.createObjectURL(typedBlob));
    matchedStudents.push(baseName);

    processed += 1;
    if (onProgress) {
      onProgress(processed, audioEntries.length);
    }
  }

  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  db.close();
  return {
    successCount: matchedStudents.length,
    matchedStudents,
  };
}

/**
 * 清除所有自定义音频缓存
 */
export async function clearCustomVoices(): Promise<void> {
  const db = await openVoiceDatabase();
  const transaction = db.transaction(VOICE_STORE_NAME, "readwrite");
  transaction.objectStore(VOICE_STORE_NAME).clear();

  await new Promise<void>((resolve) => {
    transaction.oncomplete = () => resolve();
  });

  customVoiceBlobs.clear();
  customVoiceObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  customVoiceObjectUrls.clear();
  db.close();
}
