export type SchoolId =
  | "abydos"
  | "gehenna"
  | "trinity"
  | "millennium"
  | "hyakkiyako"
  | "shanhaijing"
  | "redwinter"
  | "valkyrie"
  | "arius"
  | "srt"
  | "wildhunt"
  | "odyssey"
  | "highlander"
  | "collab"
  | "other";

export type GameMode = "ex" | "daily";

export type DifficultyFilter = "all" | SchoolId;

export type GamePhase = "setup" | "playing" | "reviewed";

export interface VoiceLine {
  title: string;        // 技能名或场景，如 "无人机支援"
  titleJp?: string;      // 日文名，如 "ドローン召喚：火力支援"
  lineJp: string;       // 日文台词原文
  lineCn: string;       // 中文翻译
  romaji?: string;      // 罗马字注音
  audioSrc?: string;    // 本地音频路径，如 "voices/shiroko_ex.ogg"
  remoteAudio?: string; // 远程官方音频 CDN 兜底
}

export interface StudentProfile {
  id: string;               // 唯一ID，如 "shiroko"
  alias: string;            // 匹配 resource.zip 中 halo.alias / chara 名字，如 "Shiroko"
  nameCn: string;           // 中文名，如 "砂狼白子"
  nameJp: string;           // 日文名，如 "砂狼シロコ"
  romaji: string;           // 罗马字，如 "Sunaookami Shiroko"
  school: SchoolId;         // 所属学园
  schoolNameCn: string;     // 学园中文名，如 "阿拜多斯高中"
  cv: string;               // 声优，如 "小仓唯"
  themeColor: string;       // 角色主色调
  tagline: string;          // 身份标签，如 "对策委员会"
  avatarSrc?: string;       // 本地官方头像路径，如 "avatars/shiroko.png"
  remoteAvatar?: string;    // 远程官方头像 CDN 兜底
  haloSrc?: string;         // 光环图片
  exVoice: VoiceLine;       // EX 技能语音 (核心)
  dailyVoice: VoiceLine;    // 日常语音 (扩展)
}

export interface ActiveRound {
  candidates: StudentProfile[]; // 4 位候选学生
  correctStudent: StudentProfile; // 正确答案
  currentVoice: VoiceLine;      // 当前测试的语音（由当前 GameMode 决定）
  mode: GameMode;
  selectedId: string | null;     // 玩家选择的学生 ID
  isCorrect: boolean | null;    // 是否正确
  hintUsed: {
    school: boolean;
    cv: boolean;
    romaji: boolean;
  };
}

export interface GameStats {
  totalPlayed: number;
  correctCount: number;
  streak: number;
  maxStreak: number;
  history: Array<{
    studentName: string;
    isCorrect: boolean;
    timestamp: number;
  }>;
}
