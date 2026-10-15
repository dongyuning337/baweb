const fs = require('fs');
const path = require('path');
const https = require('https');
const Kuroshiro = require('kuroshiro').default || require('kuroshiro');
const KuromojiAnalyzer = require('kuroshiro-analyzer-kuromoji');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf-8');
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 100) {
      return resolve();
    }
    const fullUrl = url.startsWith('//') ? 'https:' + url : url;
    https.get(fullUrl, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${fullUrl}`));
      }
      const stream = fs.createWriteStream(dest);
      res.pipe(stream);
      stream.on('finish', () => {
        stream.close(() => resolve());
      });
      stream.on('error', reject);
    }).on('error', reject);
  });
}

async function mapConcurrent(items, fn, limit = 12) {
  const results = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

function cleanRomaji(str) {
  if (!str) return '';
  let res = str
    .replace(/\s+([,\.!\?～~ー])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (res.length > 0) {
    res = res.charAt(0).toUpperCase() + res.slice(1);
  }
  return res;
}

function findExVoice(voices) {
  const nonCbt = voices.filter(v => !/cbt/i.test(v.description || '') && v.file && v.text_original && v.text_original.trim().length > 0);
  let ex = nonCbt.find(v => /(?:^|_)exskill(?:1)?_1(?:\.ogg)?$/i.test(v.description || ''));
  if (!ex) ex = nonCbt.find(v => /(?:^|_)exskill(?:1)?_level_1(?:\.ogg)?$/i.test(v.description || ''));
  if (!ex) ex = nonCbt.find(v => /(?:^|_)exskill/i.test(v.description || ''));
  return ex || null;
}

function findLobbyVoice(voices) {
  const nonCbt = voices.filter(v => !/cbt/i.test(v.description || '') && v.file && v.text_original && v.text_original.trim().length > 0);
  let lobby = nonCbt.find(v => /(?:^|_)lobby_1(?:\.ogg)?$/i.test(v.description || ''));
  if (!lobby) lobby = nonCbt.find(v => /(?:^|_)lobby_1_1(?:\.ogg)?$/i.test(v.description || ''));
  if (!lobby) lobby = nonCbt.find(v => /(?:^|_)lobby_[1-5](?:\.ogg)?$/i.test(v.description || ''));
  if (!lobby) lobby = nonCbt.find(v => /lobby/i.test(v.description || ''));
  return lobby || null;
}

async function main() {
  console.log('=== Kivotos Wiki (基沃托斯古书馆) 官方国服原声与立绘全量对齐同步 ===');
  const tStart = Date.now();

  console.log('1. 初始化 Kuroshiro 与 Kuromoji 日语形态素分析器...');
  const kuro = new Kuroshiro();
  await kuro.init(new KuromojiAnalyzer());

  console.log('2. 获取基沃托斯古书馆社团与学园官方中文映射...');
  const relMap = {};
  for (let p = 1; p <= 2; p++) {
    const r = await fetchJson('https://api.kivo.wiki/api/v1/data/relations/?page=' + p + '&page_size=100');
    if (r.data && r.data.relation) {
      r.data.relation.forEach(item => {
        relMap[item.id] = item.name_cn || item.name;
      });
    }
  }

  const schoolMap = {};
  const sRes = await fetchJson('https://api.kivo.wiki/api/v1/data/schools/');
  if (sRes.data && sRes.data.school) {
    sRes.data.school.forEach(s => {
      schoolMap[s.id] = s.name_cn || s.name;
    });
  }

  console.log('3. 拉取全部基础学生列表...');
  const allList = [];
  for (let p = 1; p <= 6; p++) {
    const res = await fetchJson('https://api.kivo.wiki/api/v1/data/students/?page=' + p + '&page_size=100');
    if (res.data && res.data.students) allList.push(...res.data.students);
  }
  const baseStudents = allList.filter(s => s.skin === '');
  console.log(`获取到 ${baseStudents.length} 位基础角色条目`);

  console.log('4. 并发拉取角色详细档案与官方原声数据...');
  const details = await mapConcurrent(baseStudents, async (s) => {
    try {
      const d = await fetchJson('https://api.kivo.wiki/api/v1/data/students/' + s.id);
      return d.data;
    } catch { return null; }
  }, 15);

  const valid = details.filter(d => d && d.is_install && d.voice && d.voice.length > 0);
  console.log(`筛选出 ${valid.length} 位已实装具有官方原声的角色`);

  const schoolIdMap = {
    1: 'abydos',
    2: 'trinity',
    3: 'gehenna',
    4: 'millennium',
    5: 'redwinter',
    7: 'shanhaijing',
    8: 'valkyrie',
    9: 'hyakkiyako',
    10: 'arius',
    11: 'srt',
    14: 'wildhunt',
    15: 'odyssey',
    24: 'highlander',
    26: 'collab'
  };

  const schoolNameMap = {
    1: '阿拜多斯高等学院',
    2: '崔尼蒂综合学院',
    3: '歌赫娜学院',
    4: '千禧年科技学院',
    5: '红冬联邦学院',
    6: '沙勒',
    7: '山海经高等学院',
    8: '瓦尔基丽警员学院',
    9: '百鬼夜行联合学院',
    10: '阿里乌斯分院',
    11: 'SRT特殊学院',
    14: '狂猎艺术学院',
    15: '奥德赛海洋学院',
    24: '海兰德铁道学院',
    26: '联动作品'
  };

  const existingColors = {
    shiroko: '#4299e1',
    hoshino: '#f687b3',
    serika: '#ed8936',
    nonomi: '#ecc94b',
    ayane: '#48bb78',
    aru: '#e53e3e',
    mutsuki: '#ed64a6',
    kayoko: '#718096',
    haruka: '#805ad5',
    hina: '#9f7aea',
    iori: '#dd6b20',
    yuuka: '#3182ce',
    noa: '#4fd1c5',
    koyuki: '#f687b3',
    arisu: '#63b3ed',
    midori: '#48bb78',
    momoi: '#ed8936',
    neru: '#e53e3e',
    asuna: '#ecc94b',
    hifumi: '#ecc94b',
    azusa: '#90cdf4',
    koharu: '#f687b3',
    hanako: '#b794f4',
    mika: '#f687b3',
    tsurugi: '#9b2c2c',
    wakamo: '#c53030',
    izuna: '#ed8936',
    cherino: '#e53e3e',
    miyako: '#4299e1',
    saori: '#4a5568'
  };

  const schoolColorPalette = {
    abydos: '#0284c7',
    trinity: '#d97706',
    gehenna: '#be123c',
    millennium: '#2563eb',
    redwinter: '#dc2626',
    shanhaijing: '#059669',
    valkyrie: '#0284c7',
    hyakkiyako: '#db2777',
    arius: '#475569',
    srt: '#0891b2',
    wildhunt: '#7c3aed',
    odyssey: '#0d9488',
    highlander: '#ea580c',
    collab: '#059669',
    other: '#6b7280'
  };

  const usedIds = new Set();
  const profiles = [];
  const voiceDownloadTasks = [];
  const avatarDownloadTasks = [];

  for (let i = 0; i < valid.length; i++) {
    const s = valid[i];
    let givenEn = (s.given_name_en || '').trim();
    let familyEn = (s.family_name_en || '').trim();
    let givenCn = (s.given_name_cn || s.given_name || '').trim();
    let familyCn = (s.family_name_cn || s.family_name || '').trim();
    let nameCn = familyCn + givenCn;
    let nameJp = (s.family_name_jp || '') + (s.given_name_jp || '');
    let romajiName = familyEn ? familyEn + ' ' + givenEn : (givenEn || nameJp);

    let baseId = givenEn.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!baseId) baseId = 'student' + s.id;
    if (s.id === 316) baseId = 'shokuhou_misaki';
    if (usedIds.has(baseId)) {
      baseId = baseId + '_' + s.id;
    }
    usedIds.add(baseId);

    const schoolKey = schoolIdMap[s.school] || 'other';
    const schoolNameCn = schoolNameMap[s.school] || schoolMap[s.school] || '其他学院';
    const tagline = relMap[s.main_relation] || schoolNameCn;
    const themeColor = existingColors[baseId] || schoolColorPalette[schoolKey] || '#3b82f6';

    // 筛选有效 EX 技能语音，必须确保台词、中文、音频切片完全同一来源
    const ex = findExVoice(s.voice);
    if (!ex) {
      console.warn(`[WARN] 未找到 EX 语音: ${nameCn}`);
      continue;
    }

    let exJp = (ex.text_original || '').trim();
    let exCn = (ex.text || '').trim();
    if (!exCn) {
      if (exJp.includes('はぁ')) exCn = '哈……';
      else if (exJp.includes('ぶっ殺す')) exCn = '啊！？宰了你哦！';
      else if (exJp.includes('饗宴')) exCn = '飨宴开幕了。';
      else if (exJp.includes('ふふ')) exCn = '呵呵，呜呵呵呵呵……';
      else if (exJp.includes('えぇっ')) exCn = '哼哼~诶！？啊——！';
      else exCn = exJp;
    }
    let exRomaji = await kuro.convert(exJp, { to: 'romaji', mode: 'spaced' });
    exRomaji = cleanRomaji(exRomaji);

    // EX Title
    const cd = s.character_datas && (s.character_datas[0] || s.character_datas['0']);
    const exSkillObj = cd && cd.skill && cd.skill.ex_skill && cd.skill.ex_skill[0];
    const exTitle = (exSkillObj && (exSkillObj.title_cn || exSkillObj.title)) || '招牌EX技能';
    const exTitleJp = (exSkillObj && exSkillObj.title) || '';

    // 筛选有效 日常羁绊问候语音，保证日常语音有专属切片
    const lobby = findLobbyVoice(s.voice);
    if (!lobby) {
      console.warn(`[WARN] 未找到日常问候语音: ${nameCn}`);
      continue;
    }

    let dailyJp = (lobby.text_original || '').trim();
    let dailyCn = (lobby.text || dailyJp).trim();

    // 纠正基沃托斯古书馆数据库中静子 (Shizuko) Lobby_1 原日文案错配问题
    if (baseId === 'shizuko' && (lobby.description || '').includes('Lobby_1')) {
      dailyJp = 'お呼びでしょうか？ 今日はどんな仕事のお手伝いをします？ 何でもお任せあれですよ～！';
      dailyCn = '您叫我了吗？今天需要我帮您做什么呢？不管是什么，尽管交给我吧～！';
    }

    let dailyRomaji = await kuro.convert(dailyJp, { to: 'romaji', mode: 'spaced' });
    dailyRomaji = cleanRomaji(dailyRomaji);

    const remoteExUrl = ex.file.startsWith('//') ? 'https:' + ex.file : ex.file;
    const remoteDailyUrl = lobby.file.startsWith('//') ? 'https:' + lobby.file : lobby.file;
    const remoteAvatarUrl = s.avatar ? (s.avatar.startsWith('//') ? 'https:' + s.avatar : s.avatar) : '';

    const profile = {
      id: baseId,
      alias: givenEn || givenCn,
      nameCn,
      nameJp,
      romaji: romajiName,
      school: schoolKey,
      schoolNameCn,
      cv: s.character_voice || '未知',
      themeColor,
      tagline,
      avatarSrc: `avatars/${baseId}.png`,
      remoteAvatar: remoteAvatarUrl,
      exVoice: {
        title: exTitle,
        titleJp: exTitleJp,
        lineJp: exJp,
        lineCn: exCn,
        romaji: exRomaji,
        audioSrc: `voices/${baseId}_ex.ogg`,
        remoteAudio: remoteExUrl
      },
      dailyVoice: {
        title: '日常羁绊问候',
        lineJp: dailyJp,
        lineCn: dailyCn,
        romaji: dailyRomaji,
        audioSrc: `voices/${baseId}_daily.ogg`,
        remoteAudio: remoteDailyUrl
      }
    };

    profiles.push(profile);

    // EX 技能音频下载任务
    voiceDownloadTasks.push({
      id: `${baseId}_ex`,
      url: remoteExUrl,
      dest: path.join(__dirname, '..', 'public', 'voices', `${baseId}_ex.ogg`)
    });

    // 日常问候音频下载任务
    voiceDownloadTasks.push({
      id: `${baseId}_daily`,
      url: remoteDailyUrl,
      dest: path.join(__dirname, '..', 'public', 'voices', `${baseId}_daily.ogg`)
    });

    // 官方高清头像下载任务
    if (remoteAvatarUrl) {
      avatarDownloadTasks.push({
        id: `${baseId}`,
        url: remoteAvatarUrl,
        dest: path.join(__dirname, '..', 'public', 'avatars', `${baseId}.png`)
      });
    }
  }

  // 确保目标目录存在
  const voicesDir = path.join(__dirname, '..', 'public', 'voices');
  const avatarsDir = path.join(__dirname, '..', 'public', 'avatars');
  if (!fs.existsSync(voicesDir)) fs.mkdirSync(voicesDir, { recursive: true });
  if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

  console.log(`5. 同步官方高清头像 (${avatarDownloadTasks.length} 位学生)...`);
  let avatarSuccess = 0;
  await mapConcurrent(avatarDownloadTasks, async (task) => {
    try {
      await downloadFile(task.url, task.dest);
      avatarSuccess++;
    } catch (err) {
      console.warn(`[WARN] 头像下载失败 ${task.id}: ${err.message}`);
    }
  }, 12);
  console.log(`头像同步完成：成功同步 ${avatarSuccess} 个官方立绘头像`);

  console.log(`6. 同步官方 EX 原声与日常原声切片 (${voiceDownloadTasks.length} 个音频文件)...`);
  let voiceSuccess = 0;
  await mapConcurrent(voiceDownloadTasks, async (task) => {
    try {
      await downloadFile(task.url, task.dest);
      voiceSuccess++;
    } catch (err) {
      console.warn(`[WARN] 语音下载失败 ${task.id}: ${err.message}`);
    }
  }, 15);
  console.log(`语音下载完成：成功同步 ${voiceSuccess} 个原声音频切片`);

  // 为旧版路径 voices/${baseId}.ogg 建立一份兼容文件
  for (const p of profiles) {
    const exFile = path.join(voicesDir, `${p.id}_ex.ogg`);
    const legacyFile = path.join(voicesDir, `${p.id}.ogg`);
    if (fs.existsSync(exFile) && !fs.existsSync(legacyFile)) {
      try {
        fs.copyFileSync(exFile, legacyFile);
      } catch {}
    }
  }

  console.log('7. 生成并严格校验 TypeScript 数据库 (src/voice-guess/data/students.ts)...');
  const jsonStr = JSON.stringify(profiles, null, 2);

  // 严密检查是否有乱码或者未知符号 �
  if (/�/.test(jsonStr)) {
    throw new Error("检测到数据中包含非法字符/替换符号 (U+FFFD)！同步中止。");
  }

  const code = `import type { StudentProfile } from "../types";

// 基沃托斯古书馆 (kivo.wiki) 官方国服汉化与原声全量数据库
// 包含 ${profiles.length} 位已实装角色的官方 EX 技能原声、日常羁绊原声及对应官方立绘头像
export const STUDENTS_DATABASE: StudentProfile[] = ${jsonStr};
`;

  const targetPath = path.join(__dirname, '..', 'src', 'voice-guess', 'data', 'students.ts');
  fs.writeFileSync(targetPath, code, 'utf-8');
  console.log(`已成功写入 ${profiles.length} 位学生的完整数据至 ${targetPath}`);
  console.log(`总耗时: ${((Date.now() - tStart) / 1000).toFixed(1)} 秒`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
