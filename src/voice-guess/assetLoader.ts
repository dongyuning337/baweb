// 资源与立绘加载器：基沃托斯古书馆官方高清头像路径自适应解析 + 优雅矢量占位回退
import type { StudentProfile } from "./types";
import { resolveAssetUrl } from "./audio";

const AVATAR_CACHE_KEY_PREFIX = "ba-voice-avatar-";

/**
 * 清除旧版错误的 halo 匹配头像缓存，防止变体立绘与基础角色冲突
 */
export function clearLegacyAvatarCache(): void {
  if (typeof window === "undefined" || !("localStorage" in window)) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(AVATAR_CACHE_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // 忽略 localStorage 异常
  }
}

/**
 * 为学生生成 BA 风格的精美矢量头像（带学园主色、姓名缩写、光环印记）
 */
export function createFallbackAvatarSvg(student: StudentProfile): string {
  const color = student.themeColor || "#3182ce";
  const nameInitials = student.nameCn.slice(-2);
  const schoolLabel = student.schoolNameCn.replace("高等学院", "").replace("综合学院", "").replace("学院", "");

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <linearGradient id="grad-${student.id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.9" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
    <filter id="glow-${student.id}" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="200" height="200" rx="28" fill="url(#grad-${student.id})" />
  <!-- 光环装饰圈 -->
  <circle cx="100" cy="55" r="26" stroke="rgba(255,255,255,0.7)" stroke-width="3" stroke-dasharray="6 4" fill="none" filter="url(#glow-${student.id})" />
  <circle cx="100" cy="55" r="14" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" fill="none" />

  <!-- 角色标志文本 -->
  <text x="100" y="125" font-family="'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="28" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">
    ${nameInitials}
  </text>
  <text x="100" y="152" font-family="'Segoe UI', sans-serif" font-size="12" font-weight="600" fill="rgba(255,255,255,0.85)" text-anchor="middle" letter-spacing="1">
    ${student.romaji}
  </text>
  <rect x="35" y="165" width="130" height="20" rx="10" fill="rgba(0,0,0,0.3)" />
  <text x="100" y="179" font-family="'PingFang SC', sans-serif" font-size="10.5" font-weight="700" fill="#38bdf8" text-anchor="middle">
    ${schoolLabel}
  </text>
</svg>
`.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * 获取角色的最终展示头像 URL，按以下优先顺序：
 * 1. 本地官方头像 (avatars/${student.id}.png)
 * 2. 远程官方 CDN 头像 (remoteAvatar)
 * 3. 矢量优雅占位 SVG
 */
export function getStudentAvatarUrl(student: StudentProfile): string {
  if (student.avatarSrc) {
    return resolveAssetUrl(student.avatarSrc);
  }
  if (student.remoteAvatar) {
    return student.remoteAvatar;
  }
  return createFallbackAvatarSvg(student);
}

/**
 * 页面初始化时清理旧缓存并确保学生头像就绪
 */
export async function tryLoadPackAvatars(
  students: StudentProfile[],
  onUpdated?: () => void,
): Promise<void> {
  if (typeof window === "undefined") return;

  // 清除旧缓存
  clearLegacyAvatarCache();

  // 为没有 avatarSrc 的角色填充
  for (const student of students) {
    if (!student.avatarSrc) {
      student.avatarSrc = createFallbackAvatarSvg(student);
    }
  }

  if (onUpdated) {
    onUpdated();
  }
}
