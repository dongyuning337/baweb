import "./style.css";
import confetti from "canvas-confetti";
import type { ActiveRound, GameMode, GameStats, SchoolId, StudentProfile } from "./types";
import { STUDENTS_DATABASE } from "./data/students";
import {
  playSfx,
  playVoice,
  stopVoice,
  subscribeVoicePlaybackState,
  getVoicePlaying,
  unlockAudio,
  isAudioUnlocked,
  getJapaneseTtsVoice,
  initVoiceStorage,
  importVoiceZipPack,
  getLoadedCustomVoiceCount,
  clearCustomVoices,
} from "./audio";
import { tryLoadPackAvatars, getStudentAvatarUrl, createFallbackAvatarSvg } from "./assetLoader";

const app = document.querySelector<HTMLDivElement>("#app")!;
if (!app) {
  throw new Error("Voice guess root container (#app) not found.");
}

const OFFICIAL_SCHOOLS: Array<{ id: SchoolId; name: string }> = [
  { id: "abydos", name: "阿拜多斯高等学院" },
  { id: "trinity", name: "崔尼蒂综合学院" },
  { id: "gehenna", name: "歌赫娜学院" },
  { id: "millennium", name: "千禧年科技学院" },
  { id: "hyakkiyako", name: "百鬼夜行联合学院" },
  { id: "shanhaijing", name: "山海经高等学院" },
  { id: "redwinter", name: "红冬联邦学院" },
  { id: "valkyrie", name: "瓦尔基丽警员学院" },
  { id: "arius", name: "阿里乌斯分院" },
  { id: "srt", name: "SRT特殊学院" },
  { id: "wildhunt", name: "狂猎艺术学院" },
  { id: "highlander", name: "海兰德铁道学院" },
  { id: "odyssey", name: "奥德赛海洋学院" },
  { id: "collab", name: "联动作品" },
];

// 游戏全局状态
const state = {
  mode: "ex" as GameMode,
  schoolFilter: "all" as "all" | SchoolId,
  students: [...STUDENTS_DATABASE],
  currentRound: null as ActiveRound | null,
  recentCorrectIds: [] as string[],
  isAudioPlaying: false,
  autoAdvance: true,
  autoAdvanceTimer: null as number | null,
  autoAdvanceProgress: 0,
  autoAdvanceInterval: null as number | null,
  isAudioModalOpen: false,
  hasPlayedInitialVoice: false,
  hasJapaneseVoice: false,
  customVoiceCount: 0,
  importStatusText: "",
  stats: {
    totalPlayed: 0,
    correctCount: 0,
    streak: 0,
    maxStreak: 0,
    history: [],
  } as GameStats,
};

// 监听音频播放状态，驱动声波动画
subscribeVoicePlaybackState((playing) => {
  state.isAudioPlaying = playing;
  updateVoiceVisualizer();
});

// 随机洗牌算法
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 生成一轮新的题目
function generateRound(): ActiveRound {
  // 根据学园筛选可用候选池
  let pool = state.students;
  let isSchoolFiltered = false;
  if (state.schoolFilter !== "all") {
    const filtered = state.students.filter((s) => s.school === state.schoolFilter);
    if (filtered.length > 0) {
      pool = filtered;
      isSchoolFiltered = true;
    }
  }

  // 避免上一题或连续重题
  const eligibleCorrect = pool.filter((s) => !state.recentCorrectIds.includes(s.id));
  const correctStudent = (eligibleCorrect.length > 0 ? eligibleCorrect : pool)[
    Math.floor(Math.random() * (eligibleCorrect.length > 0 ? eligibleCorrect.length : pool.length))
  ];

  // 记录最近答过的学生，动态调整最近排除池大小，避免人数较少的学院（如奥德赛2人）卡死
  state.recentCorrectIds.push(correctStudent.id);
  const maxRecent = Math.max(1, Math.min(3, pool.length - 1));
  if (state.recentCorrectIds.length > maxRecent) {
    state.recentCorrectIds.shift();
  }

  // 构造候选卡片
  let candidates: StudentProfile[];
  if (isSchoolFiltered) {
    if (pool.length <= 4) {
      // 人数少于或等于4人的学院（例如奥德赛2人、海蓝德3人），直接列出该学院所有学生供猜测
      candidates = shuffle(pool);
    } else {
      const distractors = shuffle(pool.filter((s) => s.id !== correctStudent.id)).slice(0, 3);
      candidates = shuffle([correctStudent, ...distractors]);
    }
  } else {
    const distractors = shuffle(state.students.filter((s) => s.id !== correctStudent.id)).slice(0, 3);
    candidates = shuffle([correctStudent, ...distractors]);
  }

  const voice = state.mode === "ex" ? correctStudent.exVoice : correctStudent.dailyVoice;

  return {
    candidates,
    correctStudent,
    currentVoice: voice,
    mode: state.mode,
    selectedId: null,
    isCorrect: null,
    hintUsed: {
      school: false,
      cv: false,
      romaji: false,
    },
  };
}

// 开始下一题
function nextRound(): void {
  clearAutoAdvanceTimer();
  stopVoice();

  state.currentRound = generateRound();
  render();

  // 延时 200ms 自动播放该题语音，带来沉浸式节奏体验
  setTimeout(() => {
    if (state.currentRound) {
      playVoice(
        state.currentRound.correctStudent,
        state.currentRound.currentVoice.lineJp,
        state.currentRound.currentVoice.audioSrc,
        state.currentRound.mode,
      );
    }
  }, 200);
}

// 重听当前语音
function replayVoice(): void {
  if (!state.currentRound) return;
  unlockAudio();
  state.hasPlayedInitialVoice = true;
  playSfx("click");
  playVoice(
    state.currentRound.correctStudent,
    state.currentRound.currentVoice.lineJp,
    state.currentRound.currentVoice.audioSrc,
    state.currentRound.mode,
  );
}

// 玩家点击选择某个学生
function handleSelect(studentId: string): void {
  const round = state.currentRound;
  if (!round || round.selectedId !== null) return;

  unlockAudio();
  state.hasPlayedInitialVoice = true;
  round.selectedId = studentId;
  const isCorrect = studentId === round.correctStudent.id;
  round.isCorrect = isCorrect;

  state.stats.totalPlayed += 1;

  if (isCorrect) {
    state.stats.correctCount += 1;
    state.stats.streak += 1;
    state.stats.maxStreak = Math.max(state.stats.maxStreak, state.stats.streak);
    playSfx("correct");

    // 达成连击时放礼花
    triggerConfetti(state.stats.streak >= 5);
    if (state.stats.streak % 5 === 0) {
      playSfx("streak");
    }

    // 自动进入下一题倒计时 (1.8s)
    if (state.autoAdvance) {
      startAutoAdvanceTimer();
    }
  } else {
    state.stats.streak = 0;
    playSfx("wrong");
  }

  render();
}

// 启动自动进入下一题倒计时
function startAutoAdvanceTimer(): void {
  clearAutoAdvanceTimer();
  state.autoAdvanceProgress = 0;
  const totalDuration = 1800;
  const step = 50;

  state.autoAdvanceInterval = window.setInterval(() => {
    state.autoAdvanceProgress += (step / totalDuration) * 100;
    const bar = document.querySelector<HTMLDivElement>(".auto-advance-bar-fill");
    if (bar) {
      bar.style.width = `${Math.min(100, state.autoAdvanceProgress)}%`;
    }
  }, step);

  state.autoAdvanceTimer = window.setTimeout(() => {
    nextRound();
  }, totalDuration);
}

function clearAutoAdvanceTimer(): void {
  if (state.autoAdvanceTimer !== null) {
    clearTimeout(state.autoAdvanceTimer);
    state.autoAdvanceTimer = null;
  }
  if (state.autoAdvanceInterval !== null) {
    clearInterval(state.autoAdvanceInterval);
    state.autoAdvanceInterval = null;
  }
  state.autoAdvanceProgress = 0;
}

// 纸屑庆祝动效
function triggerConfetti(epic = false): void {
  try {
    if (epic) {
      confetti({
        particleCount: 80,
        spread: 100,
        origin: { y: 0.6 },
        colors: ["#38bdf8", "#818cf8", "#f472b6", "#fbbf24"],
      });
    } else {
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.65 },
        colors: ["#38bdf8", "#67e8f9", "#ffffff"],
      });
    }
  } catch {
    // 礼花组件容错
  }
}

// 提示功能
function useHint(type: "school" | "cv" | "romaji"): void {
  if (!state.currentRound || state.currentRound.selectedId !== null) return;
  playSfx("click");
  state.currentRound.hintUsed[type] = true;
  render();
}

// 切换游戏模式 (EX技能 / 日常语音)
function switchMode(newMode: GameMode): void {
  if (state.mode === newMode) return;
  playSfx("click");
  state.mode = newMode;
  nextRound();
}

// 切换学园筛选
function switchSchool(school: "all" | SchoolId): void {
  playSfx("click");
  state.schoolFilter = school;
  state.recentCorrectIds = [];
  nextRound();
}

// 更新播放中视觉特效
function updateVoiceVisualizer(): void {
  const disk = document.querySelector<HTMLDivElement>(".sound-wave-disk");
  const waveText = document.querySelector<HTMLSpanElement>(".play-status-text");
  const isPlaying = state.isAudioPlaying || getVoicePlaying();

  if (disk) {
    disk.classList.toggle("is-playing", isPlaying);
  }
  if (waveText) {
    waveText.textContent = isPlaying ? "正在发声中..." : "点击圆盘重听语音 (空格键)";
  }
}

// 渲染主界面
function render(): void {
  const round = state.currentRound;
  if (!round) return;

  const accuracy =
    state.stats.totalPlayed > 0
      ? Math.round((state.stats.correctCount / state.stats.totalPlayed) * 100)
      : 0;

  const isReviewed = round.selectedId !== null;
  const isPlaying = state.isAudioPlaying || getVoicePlaying();

  app.innerHTML = `
    <div class="voice-shell">
      <!-- 顶部状态栏 -->
      <header class="game-header">
        <div class="header-left">
          <a href="../" class="back-link">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            返回首页
          </a>
          <div class="title-group">
            <span class="badge-sub">Blue Archive</span>
            <h1 class="main-title">听语音选角色</h1>
          </div>
        </div>

        <div class="header-right">
          <!-- 模式切换按钮 -->
          <div class="mode-toggle">
            <button class="mode-btn ${state.mode === "ex" ? "active" : ""}" data-mode="ex">
              ⚔️ EX 技能模式
            </button>
            <button class="mode-btn ${state.mode === "daily" ? "active" : ""}" data-mode="daily">
              ☕ 日常语音模式
            </button>
          </div>

          <!-- 音频与语音包设置入口 -->
          <button class="audio-manage-btn" id="open-audio-modal-btn">
            🎧 语音设置 ${state.customVoiceCount > 0 ? `(${state.customVoiceCount})` : ""}
          </button>

          <!-- 计分与连击 -->
          <div class="stat-pill">
            <div class="stat-item streak-item">
              <span class="stat-label">连击</span>
              <span class="stat-value streak-value">🔥 ${state.stats.streak}</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="stat-label">正确率</span>
              <span class="stat-value">${accuracy}%</span>
            </div>
            <div class="stat-divider"></div>
            <div class="stat-item">
              <span class="stat-label">题目数</span>
              <span class="stat-value">${state.stats.totalPlayed}</span>
            </div>
          </div>
        </div>
      </header>

      <!-- 筛选与控制子栏 -->
      <div class="control-bar">
        <div class="school-filter-wrap">
          <label for="school-select">学园筛选：</label>
          <select id="school-select" class="school-select">
            <option value="all" ${state.schoolFilter === "all" ? "selected" : ""}>全部学园 (${state.students.length} 位全量角色)</option>
            ${OFFICIAL_SCHOOLS.map((sch) => {
              const count = state.students.filter((s) => s.school === sch.id).length;
              if (count === 0) return "";
              return `<option value="${sch.id}" ${state.schoolFilter === sch.id ? "selected" : ""}>${sch.name} (${count}人)</option>`;
            }).join("")}
          </select>
        </div>

        <div class="advance-toggle-wrap">
          <label class="checkbox-label">
            <input type="checkbox" id="auto-advance-check" ${state.autoAdvance ? "checked" : ""}>
            <span>答对自动下一题</span>
          </label>
        </div>
      </div>

      <!-- 提示横幅 (状态说明) -->
      <div class="voice-notice-banner">
        <span class="notice-icon">✨</span>
        <span class="notice-msg">已全量内置 <strong>${state.students.length} 位实装学生官方招牌 EX 技能原声</strong>（基沃托斯古书馆国服标准译名，本地离线直出）。点击右上角<strong>「🎧 语音设置」</strong>还可自由导入更多角色语音包！</span>
      </div>

      <!-- 核心听音舞台 -->
      <section class="voice-stage">
        <div class="sound-wave-disk ${isPlaying ? "is-playing" : ""}" id="replay-btn" title="点击重新播放语音">
          <div class="halo-ring ring-1"></div>
          <div class="halo-ring ring-2"></div>
          <div class="halo-ring ring-3"></div>
          <div class="disk-center">
            <svg class="speaker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            <span class="replay-hint">点击发声</span>
          </div>
        </div>

        <div class="stage-info">
          <span class="current-mode-tag">
            ${state.mode === "ex" ? "🎯 请根据 EX 技能释放语音判断角色" : "☕ 请根据日常/大厅语音判断角色"}
          </span>
          <p class="play-status-text">${isPlaying ? "正在发声中..." : "点击圆盘或按空格键重听"}</p>
        </div>

        <!-- 提示栏 -->
        ${
          !isReviewed
            ? `
          <div class="hint-bar">
            <span class="hint-title">求助锦囊：</span>
            <button class="hint-pill ${round.hintUsed.school ? "used" : ""}" data-hint="school">
              🏫 ${round.hintUsed.school ? round.correctStudent.schoolNameCn : "所属学园"}
            </button>
            <button class="hint-pill ${round.hintUsed.cv ? "used" : ""}" data-hint="cv">
              🎙️ ${round.hintUsed.cv ? `CV: ${round.correctStudent.cv}` : "声优姓名"}
            </button>
            <button class="hint-pill ${round.hintUsed.romaji ? "used" : ""}" data-hint="romaji">
              🔤 ${round.hintUsed.romaji ? round.currentVoice.romaji || "无罗马音" : "台词发音"}
            </button>
          </div>
        `
            : ""
        }
      </section>

      <!-- 候选角色卡片 -->
      <section class="cards-grid" data-count="${round.candidates.length}">
        ${round.candidates
          .map((student, index) => {
            const isSelected = round.selectedId === student.id;
            const isTarget = student.id === round.correctStudent.id;

            let cardStateClass = "";
            if (isReviewed) {
              if (isTarget) {
                cardStateClass = "is-correct";
              } else if (isSelected) {
                cardStateClass = "is-wrong";
              } else {
                cardStateClass = "is-dimmed";
              }
            }

            return `
            <div class="student-card ${cardStateClass}" data-student-id="${student.id}" role="button" tabindex="0">
              <div class="card-key-indicator">[${index + 1}]</div>
              <div class="avatar-wrap">
                <img
                  src="${getStudentAvatarUrl(student)}"
                  alt="${student.nameCn}"
                  class="student-avatar"
                  loading="lazy"
                  onerror="this.onerror=null;this.src='${createFallbackAvatarSvg(student)}'"
                />
              </div>
              <div class="student-info">
                <div class="student-names">
                  <strong class="name-cn">${student.nameCn}</strong>
                  <span class="name-jp">${student.nameJp}</span>
                </div>
                <div class="student-meta">
                  <span class="school-tag">${student.schoolNameCn}</span>
                  <span class="cv-tag">CV: ${student.cv}</span>
                </div>
              </div>
              ${isReviewed && isTarget ? `<div class="target-badge">✨ 正确答案</div>` : ""}
              ${isReviewed && isSelected && !isTarget ? `<div class="wrong-badge">❌ 选错啦</div>` : ""}
            </div>
          `;
          })
          .join("")}
      </section>

      <!-- 答完揭晓台词面板 -->
      ${
        isReviewed
          ? `
        <section class="result-drawer ${round.isCorrect ? "result-win" : "result-loss"}">
          <div class="result-header">
            <div class="result-title-group">
              <span class="result-verdict-icon">${round.isCorrect ? "🎉 恭喜回答正确！" : "💡 遗憾选错啦～"}</span>
              <strong class="target-name-highlight">【${round.correctStudent.nameCn}】</strong>
              <span class="target-voice-title">${round.currentVoice.title || "EX技能"}</span>
            </div>
            <div class="result-actions">
              <button class="drawer-btn ghost-btn" id="drawer-replay-btn">
                🔊 再听一次
              </button>
              <button class="drawer-btn primary-btn" id="next-round-btn">
                下一题 ➔
              </button>
            </div>
          </div>

          <div class="quote-box">
            <p class="quote-jp">「${round.currentVoice.lineJp}」</p>
            <p class="quote-cn">${round.currentVoice.lineCn}</p>
            ${round.currentVoice.romaji ? `<p class="quote-romaji">${round.currentVoice.romaji}</p>` : ""}
          </div>

          ${
            state.autoAdvance && round.isCorrect
              ? `
            <div class="auto-advance-bar">
              <div class="auto-advance-bar-fill" style="width: ${state.autoAdvanceProgress}%"></div>
            </div>
          `
              : ""
          }
        </section>
      `
          : ""
      }

      <footer class="game-footer">
        <p class="keyboard-tips">
          ⌨️ 键盘快捷键：按 <strong>1 ~ ${round.candidates.length}</strong> 选择学生 · <strong>空格键</strong> 重新发声 · <strong>Enter</strong> 下一题
        </p>
      </footer>

      <!-- 语音包与音频设置弹窗 -->
      ${
        state.isAudioModalOpen
          ? `
        <div class="modal-backdrop" id="modal-backdrop">
          <div class="modal-dialog">
            <div class="modal-header">
              <h3>🎧 语音与音效设置</h3>
              <button class="modal-close-btn" id="modal-close-btn">&times;</button>
            </div>
            <div class="modal-body">
              <div class="modal-section">
                <h4>🎙️ 发声状态</h4>
                <div class="status-indicator-box">
                  <div class="status-row">
                    <span class="status-label">内置官方角色原声：</span>
                    <span class="status-tag tag-ok">🟢 全量 ${state.students.length} 位实装学生官方 EX 原声 (本地就绪)</span>
                  </div>
                  <div class="status-row">
                    <span class="status-label">用户自定义导入原声：</span>
                    <span class="status-tag ${state.customVoiceCount > 0 ? "tag-ok" : "tag-none"}">
                      ${state.customVoiceCount > 0 ? `🟢 ${state.customVoiceCount} 个学生音频` : "⚪ 暂无导入"}
                    </span>
                  </div>
                  <div class="status-row">
                    <span class="status-label">系统日语 TTS 引擎：</span>
                    <span class="status-tag ${state.hasJapaneseVoice ? "tag-ok" : "tag-warn"}">
                      ${state.hasJapaneseVoice ? "🟢 已就绪 (可朗读日文台词)" : "🟡 未检测到 (启用音律模式)"}
                    </span>
                  </div>
                </div>
              </div>

              <div class="modal-section">
                <h4>📦 导入角色音频包 (ZIP)</h4>
                <p class="modal-tip">
                  将带有角色名（如 <code>shiroko.mp3</code>、<code>hoshino.ogg</code>、<code>砂狼白子.mp3</code>）的音频文件压缩为 <strong>.zip</strong> 导入，系统会自动解压并在本地持久化缓存，无需联网即可享受纯正角色原声！
                </p>
                <div class="upload-zone">
                  <input type="file" id="voice-zip-input" accept=".zip" />
                  <label for="voice-zip-input" class="upload-label">
                    📁 选择语音包 ZIP 文件
                  </label>
                  <span class="upload-feedback">${state.importStatusText}</span>
                </div>
                ${
                  state.customVoiceCount > 0
                    ? `
                  <button class="danger-btn" id="clear-voices-btn">清除所有本地音频缓存</button>
                `
                    : ""
                }
              </div>

              <div class="modal-section">
                <h4>🔊 音频测试</h4>
                <div class="test-buttons-row">
                  <button class="ghost-btn" id="test-sfx-btn">测试反馈音效</button>
                  <button class="ghost-btn" id="test-voice-btn">测试当前学生发声</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `
          : ""
      }
    </div>
  `;

  bindEvents();
}

// 绑定 DOM 事件
function bindEvents(): void {
  // 模式切换
  app.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((btn) => {
    btn.onclick = () => {
      const mode = btn.dataset.mode as GameMode;
      switchMode(mode);
    };
  });

  // 打开音频设置弹窗
  const openAudioModalBtn = app.querySelector<HTMLButtonElement>("#open-audio-modal-btn");
  if (openAudioModalBtn) {
    openAudioModalBtn.onclick = () => {
      playSfx("click");
      state.isAudioModalOpen = true;
      render();
    };
  }

  // 关闭音频设置弹窗
  const modalCloseBtn = app.querySelector<HTMLButtonElement>("#modal-close-btn");
  if (modalCloseBtn) {
    modalCloseBtn.onclick = () => {
      state.isAudioModalOpen = false;
      render();
    };
  }

  const modalBackdrop = app.querySelector<HTMLDivElement>("#modal-backdrop");
  if (modalBackdrop) {
    modalBackdrop.onclick = (e) => {
      if (e.target === modalBackdrop) {
        state.isAudioModalOpen = false;
        render();
      }
    };
  }

  // 导入 ZIP 语音包
  const zipInput = app.querySelector<HTMLInputElement>("#voice-zip-input");
  if (zipInput) {
    zipInput.onchange = async () => {
      const file = zipInput.files?.[0];
      if (!file) return;

      state.importStatusText = "正在解析并导入语音包...";
      render();

      try {
        const result = await importVoiceZipPack(file);
        state.customVoiceCount = getLoadedCustomVoiceCount();
        state.importStatusText = `🎉 成功导入 ${result.successCount} 个角色音频！已立即生效。`;
        playSfx("correct");
      } catch (err) {
        state.importStatusText = `❌ 导入失败: ${(err as Error).message}`;
        playSfx("wrong");
      }
      render();
    };
  }

  // 清除本地缓存音频
  const clearBtn = app.querySelector<HTMLButtonElement>("#clear-voices-btn");
  if (clearBtn) {
    clearBtn.onclick = async () => {
      if (confirm("确定要清除已导入的角色语音缓存吗？")) {
        await clearCustomVoices();
        state.customVoiceCount = 0;
        state.importStatusText = "已清空本地音频缓存。";
        render();
      }
    };
  }

  // 测试音效
  const testSfxBtn = app.querySelector<HTMLButtonElement>("#test-sfx-btn");
  if (testSfxBtn) {
    testSfxBtn.onclick = async () => {
      await unlockAudio();
      playSfx("correct");
    };
  }

  // 测试发声
  const testVoiceBtn = app.querySelector<HTMLButtonElement>("#test-voice-btn");
  if (testVoiceBtn) {
    testVoiceBtn.onclick = async () => {
      await unlockAudio();
      replayVoice();
    };
  }

  // 学园筛选
  const schoolSelect = app.querySelector<HTMLSelectElement>("#school-select");
  if (schoolSelect) {
    schoolSelect.onchange = () => {
      switchSchool(schoolSelect.value as "all" | SchoolId);
    };
  }

  // 自动前进开关
  const advanceCheck = app.querySelector<HTMLInputElement>("#auto-advance-check");
  if (advanceCheck) {
    advanceCheck.onchange = () => {
      state.autoAdvance = advanceCheck.checked;
    };
  }

  // 重听圆盘点击
  const replayDisk = app.querySelector<HTMLDivElement>("#replay-btn");
  if (replayDisk) {
    replayDisk.onclick = () => replayVoice();
  }

  // 提示按钮
  app.querySelectorAll<HTMLButtonElement>(".hint-pill").forEach((btn) => {
    btn.onclick = () => {
      const hintType = btn.dataset.hint as "school" | "cv" | "romaji";
      useHint(hintType);
    };
  });

  // 选项卡片点击
  app.querySelectorAll<HTMLDivElement>(".student-card").forEach((card) => {
    card.onclick = () => {
      const studentId = card.dataset.studentId;
      if (studentId) {
        handleSelect(studentId);
      }
    };
  });

  // 抽屉重听与下一题按钮
  const drawerReplay = app.querySelector<HTMLButtonElement>("#drawer-replay-btn");
  if (drawerReplay) {
    drawerReplay.onclick = () => replayVoice();
  }

  const nextBtn = app.querySelector<HTMLButtonElement>("#next-round-btn");
  if (nextBtn) {
    nextBtn.onclick = () => {
      playSfx("click");
      nextRound();
    };
  }
}

// 全局键盘快捷键
window.addEventListener("keydown", (e) => {
  // 1-4 选选项
  if (["1", "2", "3", "4"].includes(e.key)) {
    const idx = parseInt(e.key, 10) - 1;
    if (state.currentRound && state.currentRound.candidates[idx]) {
      handleSelect(state.currentRound.candidates[idx].id);
    }
    return;
  }

  // 空格键重放
  if (e.code === "Space") {
    e.preventDefault();
    replayVoice();
    return;
  }

  // Enter 或 N 下一题
  if (e.key === "Enter" || e.key.toLowerCase() === "n") {
    if (state.currentRound && state.currentRound.selectedId !== null) {
      e.preventDefault();
      playSfx("click");
      nextRound();
    }
  }
});

// 初始化启动
async function init(): Promise<void> {
  // 生成第一题
  state.currentRound = generateRound();

  // 检查语音引擎与 IndexedDB 音频缓存
  const voice = await getJapaneseTtsVoice();
  state.hasJapaneseVoice = Boolean(voice);

  const customCount = await initVoiceStorage();
  state.customVoiceCount = customCount;

  render();

  // 异步尝试解压加载 resource.zip 中的角色真实立绘
  tryLoadPackAvatars(state.students, () => {
    render();
  });
}

init();
