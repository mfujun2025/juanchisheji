/* ============================================================
   卷尺定制图案设计器 — 核心逻辑
   数据模型：disk(底色/质感) + elements[]（坐标系 0..1000，与画布等比）
   ============================================================ */
'use strict';

/* ------------------------------------------------------------------
   0. 常量与坐标系
   逻辑坐标系 1000 x 1000，与画布像素等比，导出任意尺寸只需缩放。
   盘面实际直径按 58mm 计，r=500 即 29mm。
------------------------------------------------------------------ */
const LOGIC = 1000;
const DISC_R = 500;             // 盘面半径（逻辑单位）
const SAFE_R = 448;             // 安全区半径（约 3mm 内缩，避免裁切吃字）

/* 调色板 */
const PALETTE_LIGHT = ['#f4efe4', '#ffffff', '#e8dfc8', '#d8dde4', '#c9b79a', '#9aa7b5'];
const DISC_COLORS   = ['#3a3f45', '#2f343b', '#454b54', '#5a616b', '#242830', '#1b1f26', '#6b7280', '#8c939d'];

/* ------------------------------------------------------------------
   1. 状态
------------------------------------------------------------------ */
const state = {
  disc: { color: '#3a3f45', texture: 'matte' },
  elements: [],
  selectedId: null,
  exportSize: 1200,
  exportBg: 'disc',
  zoom: 1,
  showGuides: false,
  showShell: true,
  seq: 0,
};

const uid = () => 'el_' + (++state.seq) + '_' + Math.random().toString(36).slice(2, 7);
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const getSel = () => state.elements.find(e => e.id === state.selectedId) || null;

/* ------------------------------------------------------------------
   2. 画布与图层索引（离屏，用于像素级命中检测，正确处理旋转/弧形文字）
------------------------------------------------------------------ */
const canvas   = $('#disc');
const ctx      = canvas.getContext('2d');
canvas.width = canvas.height = 1200;   // 预览分辨率

const hitCanvas = document.createElement('canvas');
hitCanvas.width = hitCanvas.height = LOGIC;
const hitCtx = hitCanvas.getContext('2d', { willReadFrequently: true });
let layerIndex = {};   // {colorIndex: elementId}
let colorCursor = 1;

/* ------------------------------------------------------------------
   3. 字体
------------------------------------------------------------------ */
const FONT_SERIF = '"SimSun","Songti SC",serif';
const FONT_SANS  = '"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif';
const FONT_BLACK = '"Microsoft YaHei","Arial Black",Impact,sans-serif';

/* ------------------------------------------------------------------
   4. 预设水印图（内联 SVG，无需外链）
------------------------------------------------------------------ */
function svgUrl(inner, vb) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb || '0 0 100 100'}">${inner}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}
const CLR = '#111';   // 用深色绘制，元素本身靠"单色化"或透明度融入底色

const ASSETS = [
  {
    id: 'star', name: '五角星',
    url: svgUrl(`<path d="M50 8 L61.8 37.5 L93.5 39.6 L68.6 60.3 L76.8 90.8 L50 74 L23.2 90.8 L31.4 60.3 L6.5 39.6 L38.2 37.5 Z" fill="${CLR}"/>`)
  },
  {
    id: 'circle', name: '圆环',
    url: svgUrl(`<circle cx="50" cy="50" r="41" fill="none" stroke="${CLR}" stroke-width="7"/><circle cx="50" cy="50" r="27" fill="${CLR}"/>`)
  },
  {
    id: 'wing', name: '太阳飞翼',
    // 实心日轮 + 三层羽翼，向右上方展开
    url: svgUrl(`<circle cx="28" cy="30" r="20" fill="${CLR}"/>
      <path d="M50 18 Q70 20 88 34 Q86 36 82 37 Q64 33 52 34 Z" fill="${CLR}"/>
      <path d="M48 38 Q68 40 88 54 Q86 56 82 57 Q64 53 50 54 Z" fill="${CLR}"/>
      <path d="M46 58 Q64 60 82 74 Q80 76 76 77 Q60 73 48 74 Z" fill="${CLR}"/>`)
  },
  {
    id: 'wingup', name: '展翅标',
    url: svgUrl(`<path d="M50 22 L62 40 L84 30 L76 52 L94 60 L70 64 L76 88 L56 74 L50 96 L44 74 L24 88 L30 64 L6 60 L24 52 L16 30 L38 40 Z" fill="${CLR}"/>`)
  },
  {
    id: 'geometric', name: '几何标',
    url: svgUrl(`<path d="M50 6 L94 50 L50 94 L6 50 Z" fill="${CLR}"/>
      <path d="M50 26 L74 50 L50 74 L26 50 Z" fill="#fff"/>
      <circle cx="50" cy="50" r="9" fill="${CLR}"/>`)
  },
  {
    id: 'crown', name: '皇冠',
    url: svgUrl(`<path d="M10 76 L16 26 L34 48 L50 16 L66 48 L84 26 L90 76 Z" fill="${CLR}"/><rect x="10" y="79" width="80" height="9" rx="3" fill="${CLR}"/>`)
  },
  {
    id: 'shield', name: '徽章盾',
    url: svgUrl(`<path d="M50 6 L90 20 V52 Q90 82 50 96 Q10 82 10 52 V20 Z" fill="${CLR}"/>
      <path d="M50 22 L74 31 V52 Q74 72 50 82 Q26 72 26 52 V31 Z" fill="#fff"/>`)
  },
  {
    id: 'wingline', name: '展翼线',
    url: svgUrl(`<path d="M6 62 Q33 40 50 40 Q67 40 94 62 Q67 56 50 56 Q33 56 6 62 Z" fill="${CLR}"/>
      <path d="M18 78 Q36 62 50 62 Q64 62 82 78 Q64 72 50 72 Q36 72 18 78 Z" fill="${CLR}"/>`)
  },
  {
    id: 'bracket', name: '方框标',
    url: svgUrl(`<rect x="12" y="12" width="76" height="76" rx="14" fill="none" stroke="${CLR}" stroke-width="6"/>
      <path d="M50 30 L62 50 L50 70 L38 50 Z" fill="${CLR}"/>`)
  },
];

/* ------------------------------------------------------------------
   5. 元素工厂
------------------------------------------------------------------ */
function mkText(txt, opt) {
  const o = Object.assign({
    x: 500, y: 500, size: 60, font: FONT_SANS, weight: '700',
    color: '#f4efe4', spacing: 0, align: 'center', arc: 0,
    effects: { engrave: true }, dx: 0, dy: 0, maxW: 760,
  }, opt, { content: txt });
  return Object.assign({
    id: uid(), type: 'text', rotate: 0, opacity: 1,
  }, o);
}
function mkImage(url, opt) {
  return Object.assign({
    id: uid(), type: 'image', url,
    x: 500, y: 300, w: 200, h: 200,
    baseW: 200, baseH: 200,
    scale: 100, rotate: 0, shape: 'none', opacity: 1,
    bright: 100, contrast: 100, sat: 100, mono: 0,
    radialFade: true,
  }, opt || {});
}

function addEl(el, silent) {
  state.elements.push(el);
  state.selectedId = el.id;
  if (!silent) { render(); }
  return el;
}
function removeEl(id) {
  const i = state.elements.findIndex(e => e.id === id);
  if (i < 0) return;
  state.elements.splice(i, 1);
  if (state.selectedId === id) state.selectedId = null;
  render();
}
const IMG_CACHE = new Map();
function loadImg(url) {
  if (IMG_CACHE.has(url)) return IMG_CACHE.get(url);
  const p = new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.crossOrigin = 'anonymous';
    im.src = url;
  });
  IMG_CACHE.set(url, p);
  return p;
}

/* ------------------------------------------------------------------
   6. 模板
------------------------------------------------------------------ */
const TEMPLATES = [
  {
    id: 'brand', name: '企业品牌', desc: 'Logo+品牌名+电话',
    disc: { color: '#3a3f45', texture: 'matte' },
    build() {
      return [
        mkImage(svgUrl(`<circle cx="28" cy="30" r="20" fill="#f4efe4"/>
          <path d="M50 18 Q70 20 88 34 Q86 36 82 37 Q64 33 52 34 Z" fill="#f4efe4"/>
          <path d="M48 38 Q68 40 88 54 Q86 56 82 57 Q64 53 50 54 Z" fill="#f4efe4"/>
          <path d="M46 58 Q64 60 82 74 Q80 76 76 77 Q60 73 48 74 Z" fill="#f4efe4"/>`),
          { x: 500, y: 175, w: 330, h: 330, baseW: 330, baseH: 330, shape: 'none', sat: 0, mono: 0, radialFade: false }),
        mkText('DONGPENG', { x: 500, y: 515, size: 74, font: FONT_BLACK, weight: '700', spacing: 4, color: '#f4efe4' }),
        mkText('东鹏瓷砖', { x: 500, y: 648, size: 108, font: FONT_BLACK, weight: '900', spacing: 3, color: '#f4efe4' }),
        mkText('电话：136 0017 8888', { x: 500, y: 776, size: 50, font: FONT_SANS, weight: '400', spacing: 1, color: '#e2dccd' }),
        mkText('10mx25mm', { x: 500, y: 872, size: 44, font: FONT_SANS, weight: '500', spacing: 1.5, color: '#8f9aa6',
          effects: { outline2: true } }),
      ];
    }
  },
  {
    id: 'logo', name: '纯文字招牌', desc: '大标题广告位',
    disc: { color: '#3a3f45', texture: 'matte' },
    build() {
      return [
        mkText('定做商标logo', { x: 500, y: 400, size: 132, font: FONT_BLACK, weight: '900', spacing: 2, color: '#f4efe4' }),
        mkText('广告贴牌', { x: 500, y: 552, size: 132, font: FONT_BLACK, weight: '900', spacing: 8, color: '#f4efe4' }),
        mkText('专业私人定制', { x: 500, y: 730, size: 76, font: FONT_SANS, weight: '400', spacing: 6, color: '#e2dccd' }),
      ];
    }
  },
  {
    id: 'photo', name: '照片+姓名', desc: '头像照片版',
    disc: { color: '#2f343b', texture: 'matte' },
    build() {
      return [
        mkImage(null, { x: 500, y: 300, w: 400, h: 400, baseW: 400, baseH: 400, shape: 'circle', radialFade: false }),
        mkText('姓名占位', { x: 500, y: 640, size: 116, font: FONT_BLACK, weight: '900', spacing: 4, color: '#f4efe4' }),
        mkText('生日快乐 · 2026.09.18', { x: 500, y: 762, size: 54, font: FONT_SANS, weight: '400', spacing: 2, color: '#e6c98a' }),
      ];
    }
  },
  {
    id: 'date', name: '纪念日期', desc: '日期+祝福语',
    disc: { color: '#3d434b', texture: 'matte' },
    build() {
      return [
        mkText('2026.09.18', { x: 500, y: 380, size: 128, font: FONT_BLACK, weight: '900', spacing: 2, color: '#f4efe4' }),
        mkText('一起走过的第 1000 天', { x: 500, y: 530, size: 62, font: FONT_SERIF, weight: '400', spacing: 3, color: '#e2dccd' }),
        mkText('愿此后每一步都有你同行', { x: 500, y: 640, size: 48, font: FONT_SERIF, weight: '400', spacing: 2, color: '#b9c1cb' }),
        mkText('纪念日', { x: 500, y: 810, size: 46, font: FONT_SANS, weight: '500', spacing: 10, color: '#8f9aa6',
          effects: { outline2: true } }),
      ];
    }
  },
  {
    id: 'phone', name: '电话同款', desc: '大字号码显眼',
    disc: { color: '#242830', texture: 'matte' },
    build() {
      return [
        mkText('24小时上门服务', { x: 500, y: 330, size: 78, font: FONT_BLACK, weight: '900', spacing: 4, color: '#f4efe4' }),
        mkText('400-8888-666', { x: 500, y: 520, size: 152, font: FONT_BLACK, weight: '900', spacing: 0, color: '#e6c98a' }),
        mkText('疏通 · 开锁 · 维修', { x: 500, y: 665, size: 60, font: FONT_SANS, weight: '400', spacing: 6, color: '#e2dccd' }),
        mkText('老孟 · 上海宝山', { x: 500, y: 800, size: 46, font: FONT_SANS, weight: '400', spacing: 3, color: '#8f9aa6' }),
      ];
    }
  },
  {
    id: 'remark', name: '祝福语版', desc: '环绕弧形排布',
    disc: { color: '#434a53', texture: 'matte' },
    build() {
      // 弧形文字以 el.y 为弧心，文字落在 y-r 处；这里让弧顶落在 y≈210
      return [
        mkText('平安 顺遂 喜乐 安康', { x: 500, y: 560, size: 52, font: FONT_SERIF, weight: '700', spacing: 0,
          color: '#f4efe4', arc: 165, effects: { engrave: true } }),
        mkText('GOOD LUCK', { x: 500, y: 690, size: 84, font: FONT_BLACK, weight: '700', spacing: 8, color: '#e6c98a' }),
        mkText('送 给 你', { x: 500, y: 810, size: 44, font: FONT_SANS, weight: '500', spacing: 6, color: '#b9c1cb' }),
      ];
    }
  },
];

/* ------------------------------------------------------------------
   7. 绘制核心
------------------------------------------------------------------ */
function drawDiscBase(c) {
  c.save();
  c.beginPath();
  c.arc(LOGIC / 2, LOGIC / 2, DISC_R, 0, Math.PI * 2);
  c.clip();
  c.fillStyle = state.disc.color;
  c.fillRect(0, 0, LOGIC, LOGIC);
  if (state.disc.texture === 'brushed') {
    c.globalAlpha = 0.42;
    for (let y = 0; y < LOGIC; y += 2) {
      const a = (Math.random() - 0.5) * 0.2;
      c.fillStyle = a > 0 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${-a})`;
      c.fillRect(0, y, LOGIC, 2);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'overlay';
    const g = c.createLinearGradient(0, 0, LOGIC, LOGIC);
    g.addColorStop(0, 'rgba(255,255,255,.14)');
    g.addColorStop(.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.18)');
    c.fillStyle = g; c.fillRect(0, 0, LOGIC, LOGIC);
    c.globalCompositeOperation = 'source-over';
  }
  c.restore();
}

/* ---- 文字绘制 ---- */
function drawTextEl(c, el, layerColor) {
  const col = layerColor || el.color;
  c.save();
  c.translate(el.x, el.y);
  if (el.rotate) c.rotate(el.rotate * Math.PI / 180);
  c.font = `${el.weight} ${el.size}px ${el.font}`;
  c.textBaseline = 'middle';
  c.textAlign = el.align || 'center';
  c.fillStyle = col;
  c.strokeStyle = col;
  c.lineWidth = Math.max(2, el.size * 0.055);
  c.lineJoin = 'round';

  const fx = el.effects || {};

  /* --- 弧形排布：以元素锚点为圆心，文字挂在顶部圆周上 --- */
  if (el.arc && el.arc !== 0) {
    const chars = Array.from(String(el.content || ''));
    const n = Math.max(1, chars.length);
    const arcRad = el.arc * Math.PI / 180;
    // 半径由弧长反推：弧长 ≈ 字串总宽  →  r = 弧长 / 弧度
    const textW = visualWidth(c, chars.join(''), el);
    const r = arcRadius(el, textW, arcRad);
    const step = arcRad / n;                 // 每字角步长
    const start = -(arcRad / 2) + step / 2;  // 首字中心角
    c.textAlign = 'center';
    c.textBaseline = 'middle';               // 以字形中心对齐圆周，视觉最稳
    chars.forEach((ch, i) => {
      const a = start + step * i;
      c.save();
      c.rotate(a);
      // 平移 -r 后落到顶部圆周；此时局部 y 轴正方向指向圆心，
      // 恰好等于字形的"下方"，所以字形正立、无需额外翻转。
      c.translate(0, -r);
      if (fx.engrave) {
        c.fillStyle = 'rgba(0,0,0,.42)'; c.fillText(ch, el.size * 0.016, el.size * 0.024);
        c.fillStyle = 'rgba(255,255,255,.3)'; c.fillText(ch, -el.size * 0.011, -el.size * 0.016);
      } else if (fx.glow) {
        c.shadowColor = col; c.shadowBlur = el.size * 0.5;
      } else if (fx.shadow) {
        c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = el.size * 0.22;
        c.shadowOffsetY = el.size * 0.07;
      }
      c.fillStyle = col;
      c.strokeStyle = col;
      if (fx.outline) c.strokeText(ch, 0, 0);
      c.fillText(ch, 0, 0);
      c.restore();
    });
    c.restore();
    return;
  }

  /* --- 直排（支持换行 + 字间距） --- */
  const lines = String(el.content || '').split('\n');
  const lh = el.size * 1.26;
  const baseY = -(lines.length - 1) * lh / 2;
  lines.forEach((line, li) => {
    const y = baseY + li * lh;
    const w = visualWidth(c, line, el);

    // 浮雕：先黑后白的偏移叠印
    if (fx.engrave) {
      c.fillStyle = 'rgba(0,0,0,.42)';
      drawSpaced(c, line, spacingOffset(el, w), y + el.size * 0.022, el, true);
      c.fillStyle = 'rgba(255,255,255,.32)';
      drawSpaced(c, line, spacingOffset(el, w), y - el.size * 0.022, el, true);
    }
    if (fx.glow) { c.shadowColor = col; c.shadowBlur = el.size * 0.5; }
    else if (fx.shadow) {
      c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = el.size * 0.22;
      c.shadowOffsetY = el.size * 0.07;
    }
    c.fillStyle = col;
    c.strokeStyle = col;
    const off = spacingOffset(el, w);
    if (fx.outline) drawSpaced(c, line, off, y, el, false, true);
    drawSpaced(c, line, off, y, el, false);
    c.shadowBlur = 0; c.shadowOffsetY = 0;
  });
  c.restore();
}
function spacingOffset(el, w) {
  const a = el.align || 'center';
  const boxW = (el.maxW || 760) / 2;
  if (a === 'left')  return -boxW + w / 2;
  if (a === 'right') return  boxW - w / 2;
  return 0;
}
/* 逐字绘制以支持字间距 */
function drawSpaced(c, text, cx, y, el, isFillOnly, isStroke) {
  const chars = Array.from(text);
  const sp = el.spacing || 0;
  if (!sp) {
    if (isStroke) c.strokeText(text, cx, y);
    else c.fillText(text, cx, y);
    return;
  }
  let total = 0;
  const ws = chars.map(ch => { const w = c.measureText(ch).width; total += w + sp; return w; });
  total -= sp;
  let x = cx - total / 2;
  const oldAlign = c.textAlign;
  c.textAlign = 'left';
  chars.forEach((ch, i) => {
    const w0 = ws[i];
    if (isStroke) c.strokeText(ch, x, y);
    else c.fillText(ch, x, y);
    x += w0 + sp;
  });
  c.textAlign = oldAlign;
}
function visualWidth(c, text, el) {
  const chars = Array.from(String(text));
  const sp = el.spacing || 0;
  let total = 0;
  chars.forEach(ch => total += c.measureText(ch).width + sp);
  return Math.max(1, total - sp);
}

/* 弧形排布半径：由弧长反推，再夹在"不出盘面"的范围内
   元素锚点 (el.x, el.y) 是弧心；文字挂在半径 r 的顶部圆周上，
   所以顶部最高点 y = el.y - r - size/2，要求不越出盘面顶部（el.y 最小 0 处圆心靠上）。
   下限保证字不重叠，上限保证文字整体留在盘内。 */
function arcRadius(el, textW, arcRad) {
  const rNeed = textW / Math.max(0.05, Math.abs(arcRad));
  const rMin = el.size * 0.95;                      // 再小就挤成一团
  // 允许的半径上限：顶部不超出盘面（盘面顶边 y=0，留 1 个字高余量）
  const rMax = Math.max(rMin, el.y + 500 - el.size * 1.2);
  return clamp(rNeed, rMin, rMax);
}

/* ---- 图片绘制 ---- */
function drawImageEl(c, el, layerColor, img) {
  const im = img || (el._img);
  if (!im) return;
  c.save();
  c.translate(el.x, el.y);
  if (el.rotate) c.rotate(el.rotate * Math.PI / 180);

  const s = el.scale / 100;
  const w = (el.baseW || 200) * s;
  const h = (el.baseH || 200) * s;

  // 裁剪路径
  c.save();
  c.beginPath();
  if (el.shape === 'circle') {
    c.arc(0, 0, Math.min(w, h) / 2, 0, Math.PI * 2);
  } else if (el.shape === 'squircle') {
    roundRect(c, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.22);
  } else if (el.shape === 'rect') {
    c.rect(-w / 2, -h / 2, w, h);
  } else {
    // 原始：保留含透明通道的形状，用矩形近似
    c.rect(-w / 2, -h / 2, w, h);
  }
  c.closePath();
  c.clip();

  if (layerColor) {
    // 命中层：填充实色
    c.fillStyle = layerColor;
    c.fillRect(-w / 2, -h / 2, w, h);
  } else {
    c.globalAlpha = el.opacity;
    const filters = [];
    if (el.bright !== 100) filters.push(`brightness(${el.bright}%)`);
    if (el.contrast !== 100) filters.push(`contrast(${el.contrast}%)`);
    if (el.sat !== 100) filters.push(`saturate(${el.sat}%)`);
    if (el.mono) filters.push(`grayscale(${el.mono}%)`);
    if (filters.length) c.filter = filters.join(' ');
    c.drawImage(im, -w / 2, -h / 2, w, h);
    c.filter = 'none';
    // 单色化：把画面往底色/暖白两极化，模拟丝印
    if (el.mono > 0) {
      c.globalCompositeOperation = 'color';
      c.globalAlpha = (el.mono / 100) * 0.9;
      c.fillStyle = state.disc.color;
      c.fillRect(-w / 2, -h / 2, w, h);
      c.globalCompositeOperation = 'source-over';
    }
    if (el.radialFade) {
      const g = c.createRadialGradient(0, 0, Math.min(w, h) * 0.28, 0, 0, Math.min(w, h) * 0.52);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      c.globalCompositeOperation = 'destination-out';
      c.globalAlpha = 1;
      c.fillStyle = g;
      c.fillRect(-w / 2, -h / 2, w, h);
      c.globalCompositeOperation = 'source-over';
    }
    c.globalAlpha = 1;
  }
  c.restore();
  c.restore();
}
function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/* ---- 引导线 ---- */
function drawGuides(c) {
  if (!state.showGuides) return;
  const cx = LOGIC / 2, cy = LOGIC / 2;
  c.save();
  c.setLineDash([9, 9]);
  c.lineWidth = 2;
  c.strokeStyle = 'rgba(47,109,246,.62)';
  c.beginPath(); c.arc(cx, cy, SAFE_R, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = 'rgba(22,163,74,.5)';
  c.beginPath(); c.arc(cx, cy, DISC_R, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = 'rgba(47,109,246,.34)';
  c.setLineDash([5, 7]);
  c.beginPath(); c.moveTo(cx, 0); c.lineTo(cx, LOGIC); c.stroke();
  c.beginPath(); c.moveTo(0, cy); c.lineTo(LOGIC, cy); c.stroke();
  c.setLineDash([]);
  c.fillStyle = 'rgba(47,109,246,.75)';
  c.font = '600 17px ' + FONT_SANS;
  c.fillText('安全区 φ55mm', cx + 12, cy - SAFE_R + 22);
  c.restore();
}

/* ------------------------------------------------------------------
   8. 渲染
------------------------------------------------------------------ */
let renderQueued = false, lastHitBuild = 0;

function render() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; doRender(); });
}

function doRender() {
  const S = canvas.width / LOGIC;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 盘面
  ctx.save();
  ctx.scale(S, S);
  drawDiscBase(ctx);
  // 内容仅在盘面内显示
  ctx.beginPath(); ctx.arc(DISC_R, DISC_R, DISC_R, 0, Math.PI * 2); ctx.clip();
  state.elements.forEach(el => {
    if (el.type === 'text') drawTextEl(ctx, el);
    else drawImageEl(ctx, el);
  });
  // 盘面高光/边缘
  const g = ctx.createRadialGradient(LOGIC * 0.34, LOGIC * 0.28, LOGIC * 0.05, LOGIC * 0.5, LOGIC * 0.5, DISC_R);
  g.addColorStop(0, 'rgba(255,255,255,.045)');
  g.addColorStop(.62, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,.13)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LOGIC, LOGIC);
  ctx.beginPath(); ctx.arc(DISC_R, DISC_R, DISC_R - 1.2, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 2.4; ctx.stroke();
  ctx.restore();

  // 引导线（画在盘面之上、不参与导出）
  ctx.save(); ctx.scale(S, S); drawGuides(ctx); ctx.restore();

  // 命中层：图像每 2 次渲染重建一次即可（拖动中只需选框跟随）
  const now = performance.now();
  if (now - lastHitBuild > 120) { buildHitLayer(); lastHitBuild = now; }

  syncHitBoxes();
  syncLayerList();
  syncProps();
}

/* ---- 构建像素命中层 ---- */
function buildHitLayer() {
  hitCtx.setTransform(1, 0, 0, 1, 0, 0);
  hitCtx.clearRect(0, 0, LOGIC, LOGIC);
  layerIndex = {};
  colorCursor = 1;
  state.elements.forEach(el => {
    const c = layerColor(++colorCursor);
    layerIndex[colorCursor] = el.id;
    if (el.type === 'text') drawTextEl(hitCtx, el, c);
    else if (el._img) drawImageEl(hitCtx, el, c);
  });
  // 缓存一份裁剪层，供拖拽时即时 hittest（避免频繁重建）
  hitImageData = hitCtx.getImageData(0, 0, LOGIC, LOGIC).data;
}
let hitImageData = null;

function layerColor(i) {
  return `rgb(${i & 255},${(i >> 8) & 255},${(i >> 16) & 255})`;
}
function hitTest(lx, ly) {
  const x = Math.round(lx), y = Math.round(ly);
  if (x < 0 || y < 0 || x >= LOGIC || y >= LOGIC) return null;
  const i = (y * LOGIC + x) * 4;
  if (!hitImageData) return null;
  const a = hitImageData[i + 3];
  if (a < 40) return null;
  const key = hitImageData[i] | (hitImageData[i + 1] << 8) | (hitImageData[i + 2] << 16);
  return layerIndex[key] || null;
}

/* ------------------------------------------------------------------
   9. 交互层：选择框 / 拖动 / 双击编辑
------------------------------------------------------------------ */
const hitLayer = $('#hitLayer');
const discWrap = $('.disc-wrap');

function elBBox(el) {
  let w, h;
  if (el.type === 'text') {
    ctx.save();
    ctx.font = `${el.weight} ${el.size}px ${el.font}`;
    const lines = String(el.content || '').split('\n');
    w = Math.max(...lines.map(l => visualWidth(ctx, l, el)), 30);
    h = lines.length * el.size * 1.26;
    ctx.restore();
    if (el.arc) {
      // 弧形文字包围盒：与绘制端共用 arcRadius，保证选框贴合
      const arcRad = el.arc * Math.PI / 180;
      const textW = visualWidth(ctx, String(el.content || ''), el);
      const r = arcRadius(el, textW, arcRad);
      const span = Math.min(Math.abs(arcRad), Math.PI);
      const hw = Math.abs(r * Math.sin(span / 2)) + el.size * 0.6;
      const hh = r - r * Math.cos(span / 2) + el.size * 1.1;
      w = Math.max(w, hw * 2); h = Math.max(h, hh);
      return { x: el.x - w / 2, y: el.y - r - el.size * 0.55, w, h, rot: el.rotate || 0, cx: el.x, cy: el.y };
    }
    return { x: el.x - w / 2, y: el.y - h / 2, w, h, rot: el.rotate || 0, cx: el.x, cy: el.y };
  }
  const s = el.scale / 100;
  w = (el.baseW || 200) * s; h = (el.baseH || 200) * s;
  return { x: el.x - w / 2, y: el.y - h / 2, w, h, rot: el.rotate || 0, cx: el.x, cy: el.y };
}

let editing = null;

function syncHitBoxes() {
  // 清理旧框（保留正在编辑的）
  $$('.hit', hitLayer).forEach(n => { if (!n.isConnected) return; n.remove(); });
  state.elements.forEach(el => {
    const b = elBBox(el);
    const d = document.createElement('div');
    d.className = 'hit' + (el.id === state.selectedId ? ' is-sel' : '');
    d.dataset.id = el.id;
    d.style.left = (b.x / LOGIC * 100) + '%';
    d.style.top = (b.y / LOGIC * 100) + '%';
    d.style.width = (b.w / LOGIC * 100) + '%';
    d.style.height = (b.h / LOGIC * 100) + '%';
    if (b.rot) d.style.transform = `rotate(${b.rot}deg)`;
    const tag = document.createElement('span');
    tag.className = 'hit-tag';
    tag.textContent = el.type === 'text'
      ? ('T · ' + String(el.content || '').replace(/\n/g, ' ').slice(0, 14))
      : '图片';
    d.appendChild(tag);
    hitLayer.appendChild(d);
  });
  if (editing) mountInlineEditor(editing);
}

/* 拖动 */
let drag = null;
hitLayer.addEventListener('pointerdown', e => {
  const box = e.target.closest('.hit');
  if (!box) return;
  const el = state.elements.find(x => x.id === box.dataset.id);
  if (!el) return;
  select(el.id);
  const pt = toLogic(e.clientX, e.clientY);
  drag = { el, dx: pt.x - el.x, dy: pt.y - el.y, sx: e.clientX, sy: e.clientY, moved: false };
  // 指针捕获在部分环境下会抛 InvalidStateError（合成事件/已释放指针），忽略即可
  try { box.setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault();
});
hitLayer.addEventListener('pointermove', e => {
  if (!drag) return;
  const pt = toLogic(e.clientX, e.clientY);
  drag.el.x = clamp(pt.x - drag.dx, -100, LOGIC + 100);
  drag.el.y = clamp(pt.y - drag.dy, -100, LOGIC + 100);
  drag.moved = true;
  const b = elBBox(drag.el);
  const box = hitLayer.querySelector(`.hit[data-id="${drag.el.id}"]`);
  if (box) {
    box.style.left = (b.x / LOGIC * 100) + '%';
    box.style.top = (b.y / LOGIC * 100) + '%';
  }
  render();
});
hitLayer.addEventListener('pointerup', e => {
  if (drag) {
    const box = hitLayer.querySelector(`.hit[data-id="${drag.el.id}"]`);
    if (box) { try { box.releasePointerCapture(e.pointerId); } catch (_) {} }
    if (drag.moved) markDirty();
    drag = null;
  }
});

/* 双击文字：就地编辑 */
hitLayer.addEventListener('dblclick', e => {
  const box = e.target.closest('.hit');
  if (!box) return;
  const el = state.elements.find(x => x.id === box.dataset.id);
  if (el && el.type === 'text') openInlineEditor(el);
});

function openInlineEditor(el) {
  editing = el;
  mountInlineEditor(el);
}
function mountInlineEditor(el) {
  const old = hitLayer.querySelector('.hit-inline');
  if (old) old.remove();
  const b = elBBox(el);
  const ta = document.createElement('textarea');
  ta.className = 'hit-inline';
  ta.value = el.content || '';
  ta.style.left = (b.x / LOGIC * 100) + '%';
  ta.style.top = (b.y / LOGIC * 100) + '%';
  ta.style.width = (b.w / LOGIC * 100) + '%';
  ta.style.height = (b.h / LOGIC * 100) + '%';
  ta.style.fontSize = (el.size / LOGIC * discWrap.clientWidth * 0.92) + 'px';
  ta.style.fontFamily = el.font;
  ta.style.color = el.color;
  ta.style.fontWeight = el.weight;
  if (b.rot) ta.style.transform = `rotate(${b.rot}deg)`;
  hitLayer.appendChild(ta);
  ta.focus();
  ta.select();
  const finish = () => {
    const v = ta.value;
    ta.remove();
    editing = null;
    if (v !== el.content) { el.content = v; markDirty(); }
    render();
  };
  ta.addEventListener('blur', finish);
  ta.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { ta.value = el.content; ta.blur(); }
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ta.blur(); }
    ev.stopPropagation();
  });
}

/* 坐标换算 */
function toLogic(clientX, clientY) {
  const r = discWrap.getBoundingClientRect();
  return {
    x: (clientX - r.left) / r.width * LOGIC,
    y: (clientY - r.top) / r.height * LOGIC,
  };
}

/* 滚轮缩放所选 */
$('#canvasWrap').addEventListener('wheel', e => {
  const el = getSel();
  if (!el) return;
  e.preventDefault();
  if (el.type === 'text') {
    el.size = clamp(el.size * (e.deltaY > 0 ? 0.94 : 1.06), 8, 300);
  } else {
    el.scale = clamp(el.scale * (e.deltaY > 0 ? 0.94 : 1.06), 20, 400);
  }
  markDirty(); render();
}, { passive: false });

/* 键盘 */
document.addEventListener('keydown', e => {
  if (editing) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  const el = getSel();
  if (!el) return;
  const step = e.shiftKey ? 10 : 2;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeEl(el.id); toast('已删除'); return; }
  if (e.key === 'ArrowLeft')  { el.x -= step; }
  else if (e.key === 'ArrowRight') { el.x += step; }
  else if (e.key === 'ArrowUp')    { el.y -= step; }
  else if (e.key === 'ArrowDown')  { el.y += step; }
  else return;
  e.preventDefault(); markDirty(); render();
});

/* ------------------------------------------------------------------
   10. 选中 & 属性同步
------------------------------------------------------------------ */
function select(id) {
  state.selectedId = id;
  syncHitBoxes();
  syncLayerList();
  syncProps();
}
/* 点击空白取消选择 */
discWrap.addEventListener('pointerdown', e => {
  if (!e.target.closest('.hit')) { select(null); }
});

function syncProps() {
  const el = getSel();
  ['textBlock', 'imgBlock', 'posBlock'].forEach(id => $('#' + id).classList.add('hidden'));
  if (!el) {
    $('#selHint').textContent = '尚未选中元素，点击画布上的文字或图片';
    return;
  }
  $('#posBlock').classList.remove('hidden');
  $('#vPosX').textContent = Math.round(el.x - 500);
  $('#vPosY').textContent = Math.round(el.y - 500);
  $('#posX').value = clamp(el.x - 500, -100, 100);
  $('#posY').value = clamp(el.y - 500, -100, 100);

  if (el.type === 'text') {
    $('#selHint').textContent = '正在编辑：文字';
    $('#textBlock').classList.remove('hidden');
    $('#txtContent').value = el.content || '';
    $('#txtFont').value = el.font;
    $('#txtSize').value = el.size; $('#vSize').textContent = Math.round(el.size);
    $('#txtWeight').value = el.weight;
    $('#txtSpacing').value = el.spacing; $('#vSpacing').textContent = el.spacing;
    $('#txtColor').value = toHex(el.color);
    $('#txtArc').value = el.arc || 0; $('#vArc').textContent = Math.round(el.arc || 0) + '°';
    $$('#txtEffects .chip').forEach(c => c.classList.toggle('is-on', !!(el.effects && el.effects[c.dataset.fx])));
    $$('#txtAlign .chip').forEach(c => c.classList.toggle('is-on', (el.align || 'center') === c.dataset.align));
    markSwatch('#txtSwatches', el.color);
  } else {
    $('#selHint').textContent = '正在编辑：图片';
    $('#imgBlock').classList.remove('hidden');
    $('#imgScale').value = el.scale; $('#vImgScale').textContent = Math.round(el.scale) + '%';
    $('#imgRot').value = el.rotate; $('#vImgRot').textContent = Math.round(el.rotate) + '°';
    $('#imgOpacity').value = Math.round(el.opacity * 100);
    $('#vImgOpacity').textContent = Math.round(el.opacity * 100) + '%';
    $('#imgBright').value = el.bright; $('#vImgBright').textContent = el.bright + '%';
    $('#imgContrast').value = el.contrast; $('#vImgContrast').textContent = el.contrast + '%';
    $('#imgSat').value = el.sat; $('#vImgSat').textContent = el.sat + '%';
    $('#imgMono').value = el.mono; $('#vImgMono').textContent = el.mono + '%';
    $$('#imgShape .chip').forEach(c => c.classList.toggle('is-on', el.shape === c.dataset.shape));
  }
}
function toHex(c) {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  const d = document.createElement('div');
  d.style.color = c; document.body.appendChild(d);
  const rgb = getComputedStyle(d).color; d.remove();
  const m = rgb.match(/\d+/g);
  if (!m) return '#ffffff';
  return '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
}
function markSwatch(sel, color) {
  $$(sel + ' .sw').forEach(s => s.classList.toggle('is-on', s.dataset.c.toLowerCase() === String(color).toLowerCase()));
}

/* 图层列表 */
function syncLayerList() {
  const ul = $('#layerList');
  ul.innerHTML = '';
  [...state.elements].reverse().forEach(el => {
    const li = document.createElement('li');
    li.className = 'li' + (el.id === state.selectedId ? ' is-sel' : '');
    li.innerHTML = `<span class="li-ic">${el.type === 'text' ? 'T' : '▣'}</span>
      <span class="li-t">${el.type === 'text'
        ? (String(el.content || '（空文字）').replace(/\n/g, ' ').slice(0, 20) || '（空文字）')
        : '图片'}</span>
      <span class="li-x" title="删除">✕</span>`;
    li.addEventListener('click', ev => {
      if (ev.target.classList.contains('li-x')) { removeEl(el.id); return; }
      select(el.id);
    });
    ul.appendChild(li);
  });
  if (!state.elements.length) {
    ul.innerHTML = '<li style="font-size:11.5px;color:#98a1b0;padding:5px 0">暂无元素，从左侧模板或按钮开始</li>';
  }
}

let dirty = false;
function markDirty() { dirty = true; }

/* ------------------------------------------------------------------
   11. 左侧面板：模板 / 水印素材 / 上传 / 快速加文字
------------------------------------------------------------------ */
function buildTemplateUI() {
  const grid = $('#tplGrid');
  grid.innerHTML = '';
  TEMPLATES.forEach(t => {
    const b = document.createElement('button');
    b.className = 'tpl'; b.type = 'button'; b.dataset.id = t.id;
    // 按模板真实元素生成缩略预览：文字按相对位置/字号/颜色摆放
    const els = t.build();
    const spans = els.filter(e => e.type === 'text').map(e => {
      const top = clamp(e.y / 1000 * 100, 8, 88);
      const fs = clamp(e.size / 1000 * 62, 5.5, 17);
      const rot = e.arc ? `transform:rotate(${(e.arc / 2).toFixed(1)}deg);` : '';
      return `<span style="top:${top.toFixed(1)}%;font-size:${fs.toFixed(1)}px;color:${e.color};${rot}">${escapeHtml(String(e.content).replace(/\n/g, ' ').slice(0, 8))}</span>`;
    }).join('');
    const hasImg = els.some(e => e.type === 'image');
    const imgDot = hasImg
      ? `<span style="top:${(els.find(e => e.type === 'image').y / 1000 * 100).toFixed(1)}%;
           font-size:15px;color:rgba(255,255,255,.9)">◉</span>` : '';
    b.innerHTML = `<span class="tpl-prev" style="background:${t.disc.color}">${imgDot}${spans}</span>
      <span class="tpl-name">${t.name}</span>
      <span class="tpl-desc">${t.desc}</span>`;
    b.addEventListener('click', () => applyTemplate(t, b));
    grid.appendChild(b);
  });
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function applyTemplate(t, btn) {
  if (state.elements.length) {
    if (!confirm('应用模板会替换当前盘面上的所有元素，继续吗？')) return;
  }
  state.disc = Object.assign({}, t.disc);
  state.elements = [];
  state.selectedId = null;
  const els = t.build();
  els.forEach(e => {
    if (e.type === 'image') {
      if (!e.url) {
        e.url = PLACEHOLDER_PHOTO;
        e.baseW = e.baseW || 400; e.baseH = e.baseH || 400;
      }
      preload(e);
    }
    state.elements.push(e);
  });
  $$('.tpl').forEach(n => n.classList.toggle('is-active', n === btn));
  syncDiscUI();
  markDirty();
  render();
  toast(`已应用模板：${t.name}`);
  if (t.id === 'photo') toast('点击盘面照片，在右侧「替换这张图片」上传你的照片');
}

/* 照片占位图（内联 SVG 人像剪影） */
const PLACEHOLDER_PHOTO = svgUrl(`<rect width="100" height="100" fill="#c8ccd4"/>
  <circle cx="50" cy="38" r="17" fill="#8f97a3"/>
  <path d="M14 100 Q14 66 50 66 Q86 66 86 100 Z" fill="#8f97a3"/>`);
const PLACEHOLDER_PHOTO_WHITE = svgUrl(`<rect width="100" height="100" fill="#dfe3e8"/>
  <circle cx="50" cy="38" r="17" fill="#ffffff"/>
  <path d="M14 100 Q14 66 50 66 Q86 66 86 100 Z" fill="#ffffff"/>`);

function preload(el) {
  if (!el.url) return;
  loadImg(el.url).then(im => {
    el._img = im;
    if (el.type === 'image' && !el._naturalSet) {
      el._naturalSet = true;
      if (!el.baseW) { el.baseW = im.naturalWidth || 200; el.baseH = im.naturalHeight || 200; }
      else {
        const ar = (im.naturalWidth || 1) / (im.naturalHeight || 1);
        el.baseH = el.baseW / ar;
      }
    }
    render();
  }).catch(() => {});
}

/* 水印素材 */
function buildAssetUI() {
  const row = $('#assetRow');
  row.innerHTML = '';
  ASSETS.forEach(a => {
    const b = document.createElement('button');
    b.className = 'asset'; b.type = 'button'; b.title = a.name;
    b.innerHTML = `<svg viewBox="0 0 100 100">${a.name === '五角星'
      ? '<path d="M50 8 L61.8 37.5 L93.5 39.6 L68.6 60.3 L76.8 90.8 L50 74 L23.2 90.8 L31.4 60.3 L6.5 39.6 L38.2 37.5 Z" fill="#3a4150"/>'
      : '<circle cx="50" cy="50" r="30" fill="none" stroke="#3a4150" stroke-width="6"/>'}</svg>`;
    b.addEventListener('click', () => addAsset(a));
    row.appendChild(b);
  });
}
function addAsset(a) {
  const el = mkImage(a.url, {
    x: 500, y: 320, w: 260, h: 260, baseW: 260, baseH: 260,
    shape: 'none', radialFade: false, mono: 0, sat: 0,
  });
  // 深色底 → 用暖白填充素材；浅色底 → 深色
  el._invert = isDark(state.disc.color);
  if (el._invert) el.url = invertSvg(a.url);
  preload(el);
  addEl(el);
  markDirty();
  toast(`已添加「${a.name}」，可拖动到任意位置`);
}
function isDark(hex) {
  const h = toHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}
function invertSvg(url) {
  // SVG data URI 中把 #111 换成暖白
  return url.replace(/%23111/gi, '%23f4efe4').replace(/#111/gi, '#f4efe4');
}

/* 上传 */
const fileInput = $('#fileInput');
const dropzone = $('#dropzone');
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('is-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-over'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('is-over');
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => { handleFiles(fileInput.files); fileInput.value = ''; });

async function handleFiles(files) {
  const list = Array.from(files || []).filter(f => f.type.startsWith('image/'));
  if (!list.length) { toast('请选择图片文件'); return; }
  for (let i = 0; i < list.length; i++) {
    try {
      const url = await compressImage(list[i], 2000, 0.9);
      const el = mkImage(url, { x: 500, y: 400, shape: 'circle', radialFade: false });
      preload(el);
      state.elements.push(el);
      state.selectedId = el.id;
      markDirty();
    } catch (err) { toast('有图片读取失败，已跳过'); }
  }
  render();
  toast(`已添加 ${list.length} 张图片，可拖动/缩放/裁剪`);
}

/* 压缩，避免内存爆掉 */
function compressImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const im = new Image();
      im.onerror = reject;
      im.onload = () => {
        let { width: w, height: h } = im;
        const scale = Math.min(1, maxSide / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const cx = cv.getContext('2d');
        cx.drawImage(im, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', quality));
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* 快速加文字 */
const QUICK = {
  title:  { content: '品牌名称', size: 110, weight: '900', color: '#f4efe4', y: 420 },
  sub:    { content: '副标题文字', size: 62, weight: '400', color: '#e2dccd', y: 560 },
  phone:  { content: '400-8888-666', size: 96, weight: '900', color: '#e6c98a', y: 640 },
  date:   { content: '2026.09.18', size: 96, weight: '700', color: '#f4efe4', y: 640 },
  slogan: { content: '祝 你 平安喜乐', size: 68, weight: '500', color: '#f4efe4', y: 640 },
  spec:   { content: '10mx25mm', size: 46, weight: '500', color: '#8f9aa6', y: 870, effects: { outline2: true } },
};
$$('.qa-btn').forEach(b => b.addEventListener('click', () => {
  const k = b.dataset.add;
  const cfg = QUICK[k] || QUICK.sub;
  const el = mkText(cfg.content, Object.assign({}, cfg, { effects: cfg.effects || { engrave: true } }));
  addEl(el); markDirty();
  toast('已添加文字，双击画布上的文字可直接改内容');
}));

/* ------------------------------------------------------------------
   12. 右侧属性事件
------------------------------------------------------------------ */
/* 盘面 */
const discSw = $('#discSwatches');
DISC_COLORS.forEach(c => {
  const s = document.createElement('button');
  s.className = 'sw'; s.type = 'button'; s.dataset.c = c;
  s.style.background = c;
  s.addEventListener('click', () => { state.disc.color = c; $('#discColor').value = c; markSwatch('#discSwatches', c); markDirty(); render(); });
  discSw.appendChild(s);
});
$('#discColor').addEventListener('input', e => {
  state.disc.color = e.target.value; markSwatch('#discSwatches', e.target.value); markDirty(); render();
});
$('#discTexture').addEventListener('change', e => { state.disc.texture = e.target.value; markDirty(); render(); });
function syncDiscUI() {
  $('#discColor').value = state.disc.color;
  $('#discTexture').value = state.disc.texture;
  markSwatch('#discSwatches', state.disc.color);
}

/* 文字 */
const txtSw = $('#txtSwatches');
PALETTE_LIGHT.forEach(c => {
  const s = document.createElement('button');
  s.className = 'sw'; s.type = 'button'; s.dataset.c = c; s.style.background = c;
  s.addEventListener('click', () => { const el = getSel(); if (!el || el.type !== 'text') return; el.color = c; $('#txtColor').value = c; markSwatch('#txtSwatches', c); markDirty(); render(); });
  txtSw.appendChild(s);
});
function bindText(id, key, transform, valId, suffix) {
  const n = $('#' + id);
  n.addEventListener('input', () => {
    const el = getSel(); if (!el || el.type !== 'text') return;
    el[key] = transform ? transform(n.value) : n.value;
    if (valId) $('#' + valId).textContent = n.value + (suffix || '');
    markDirty(); render();
  });
}
$('#txtContent').addEventListener('input', e => {
  const el = getSel(); if (!el || el.type !== 'text') return;
  el.content = e.target.value; markDirty(); render();
});
bindText('txtSize', 'size', Number, 'vSize');
bindText('txtSpacing', 'spacing', Number, 'vSpacing');
bindText('txtArc', 'arc', Number, 'vArc', '°');
$('#txtFont').addEventListener('change', e => { const el = getSel(); if (el && el.type === 'text') { el.font = e.target.value; markDirty(); render(); } });
$('#txtWeight').addEventListener('change', e => { const el = getSel(); if (el && el.type === 'text') { el.weight = e.target.value; markDirty(); render(); } });
$('#txtColor').addEventListener('input', e => {
  const el = getSel(); if (!el || el.type !== 'text') return;
  el.color = e.target.value; markSwatch('#txtSwatches', e.target.value); markDirty(); render();
});
$$('#txtEffects .chip').forEach(c => c.addEventListener('click', () => {
  const el = getSel(); if (!el || el.type !== 'text') return;
  el.effects = el.effects || {};
  const on = !el.effects[c.dataset.fx];
  el.effects[c.dataset.fx] = on;
  c.classList.toggle('is-on', on);
  markDirty(); render();
}));
$$('#txtAlign .chip').forEach(c => c.addEventListener('click', () => {
  const el = getSel(); if (!el || el.type !== 'text') return;
  el.align = c.dataset.align;
  $$('#txtAlign .chip').forEach(x => x.classList.toggle('is-on', x === c));
  markDirty(); render();
}));

/* 图片 */
function bindImg(id, key, transform, valId, suffix) {
  $('#' + id).addEventListener('input', e => {
    const el = getSel(); if (!el || el.type !== 'image') return;
    el[key] = transform ? transform(e.target.value) : Number(e.target.value);
    if (valId) $('#' + valId).textContent = Math.round(e.target.value) + (suffix || '');
    markDirty(); render();
  });
}
bindImg('imgScale', 'scale', Number, 'vImgScale', '%');
bindImg('imgRot', 'rotate', Number, 'vImgRot', '°');
bindImg('imgBright', 'bright', Number, 'vImgBright', '%');
bindImg('imgContrast', 'contrast', Number, 'vImgContrast', '%');
bindImg('imgSat', 'sat', Number, 'vImgSat', '%');
bindImg('imgMono', 'mono', Number, 'vImgMono', '%');
$('#imgOpacity').addEventListener('input', e => {
  const el = getSel(); if (!el || el.type !== 'image') return;
  el.opacity = Number(e.target.value) / 100;
  $('#vImgOpacity').textContent = e.target.value + '%';
  markDirty(); render();
});
$$('#imgShape .chip').forEach(c => c.addEventListener('click', () => {
  const el = getSel(); if (!el || el.type !== 'image') return;
  el.shape = c.dataset.shape;
  $$('#imgShape .chip').forEach(x => x.classList.toggle('is-on', x === c));
  markDirty(); render();
}));
$('#btnReplaceImg').addEventListener('click', () => { replacingId = state.selectedId; fileInput.click(); });
let replacingId = null;
fileInput.addEventListener('change', () => {
  if (replacingId) {
    const el = state.elements.find(e => e.id === replacingId);
    const f = fileInput.files[0];
    if (el && f) {
      compressImage(f, 2000, 0.9).then(url => {
        el.url = url; el._img = null; preload(el);
        markDirty();
        toast('图片已替换');
      });
    }
    replacingId = null;
    fileInput.value = '';
  }
});

/* 位置 */
['posX', 'posY'].forEach(k => {
  $('#' + k).addEventListener('input', e => {
    const el = getSel(); if (!el) return;
    const v = Number(e.target.value);
    if (k === 'posX') el.x = 500 + v; else el.y = 500 + v;
    $('#' + (k === 'posX' ? 'vPosX' : 'vPosY')).textContent = v;
    markDirty(); render();
  });
});
$('#btnCenterH').addEventListener('click', () => { const el = getSel(); if (el) { el.x = 500; markDirty(); render(); } });
$('#btnCenterV').addEventListener('click', () => { const el = getSel(); if (el) { el.y = 500; markDirty(); render(); } });
$('#btnUp').addEventListener('click', () => {
  const el = getSel(); if (!el) return;
  const i = state.elements.indexOf(el);
  if (i < state.elements.length - 1) { state.elements.splice(i, 1); state.elements.splice(i + 1, 0, el); markDirty(); render(); }
});
$('#btnDown').addEventListener('click', () => {
  const el = getSel(); if (!el) return;
  const i = state.elements.indexOf(el);
  if (i > 0) { state.elements.splice(i, 1); state.elements.splice(i - 1, 0, el); markDirty(); render(); }
});
$('#btnDel').addEventListener('click', () => { const el = getSel(); if (el) { removeEl(el.id); toast('已删除'); } });

/* ------------------------------------------------------------------
   13. 视图控制
------------------------------------------------------------------ */
$('#chkGuides').addEventListener('change', e => { state.showGuides = e.target.checked; render(); });
$('#chkShell').addEventListener('change', e => {
  state.showShell = e.target.checked;
  $('#shell').classList.toggle('is-on', state.showShell);
});
function setZoom(z) {
  state.zoom = clamp(z, 0.4, 2.4);
  $('#canvasHolder').style.transform = `scale(${state.zoom})`;
  $('#zVal').textContent = Math.round(state.zoom * 100) + '%';
}
$('#zIn').addEventListener('click', () => setZoom(state.zoom * 1.14));
$('#zOut').addEventListener('click', () => setZoom(state.zoom / 1.14));
$('#btnFit').addEventListener('click', () => setZoom(1));
window.addEventListener('resize', () => { render(); });

/* 双指缩放（触摸） */
let pinch = null;
$('#canvasWrap').addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    pinch = { d: touchDist(e), z: state.zoom };
    e.preventDefault();
  }
}, { passive: false });
$('#canvasWrap').addEventListener('touchmove', e => {
  if (e.touches.length === 2 && pinch) {
    setZoom(pinch.z * (touchDist(e) / pinch.d));
    e.preventDefault();
  }
}, { passive: false });
$('#canvasWrap').addEventListener('touchend', () => { pinch = null; });
function touchDist(e) {
  const a = e.touches[0], b = e.touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/* ------------------------------------------------------------------
   14. 导出
------------------------------------------------------------------ */
function exportImage() {
  const size = Number($('#expSize').value) || 1200;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const S = size / LOGIC;

  if (state.exportBg === 'white') { c.fillStyle = '#ffffff'; c.fillRect(0, 0, size, size); }

  c.save();
  c.scale(S, S);
  if (state.exportBg !== 'transparent') drawDiscBase(c);
  c.beginPath(); c.arc(DISC_R, DISC_R, DISC_R, 0, Math.PI * 2); c.clip();
  state.elements.forEach(el => {
    if (el.type === 'text') drawTextEl(c, el);
    else drawImageEl(c, el);
  });
  const g = c.createRadialGradient(LOGIC * 0.34, LOGIC * 0.28, LOGIC * 0.05, LOGIC * 0.5, LOGIC * 0.5, DISC_R);
  g.addColorStop(0, 'rgba(255,255,255,.045)');
  g.addColorStop(.62, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,.13)');
  c.fillStyle = g; c.fillRect(0, 0, LOGIC, LOGIC);
  c.restore();

  cv.toBlob(blob => {
    if (!blob) { toast('导出失败，请重试'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const t = new Date();
    const pad = n => String(n).padStart(2, '0');
    a.download = `卷尺盘面_${size}px_${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}_${pad(t.getHours())}${pad(t.getMinutes())}.png`;
    a.href = url;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`已导出 ${size}×${size} PNG，可直接交印刷`);
    dirty = false;
  }, 'image/png');
}
$('#btnExport').addEventListener('click', exportImage);
$('#btnExport2').addEventListener('click', exportImage);

/* ------------------------------------------------------------------
   15. 其它 UI
------------------------------------------------------------------ */
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 2400);
}
$('#btnHelp').addEventListener('click', () => { $('#helpModal').hidden = false; });
$('#helpClose').addEventListener('click', () => { $('#helpModal').hidden = true; });
$('#helpModal').addEventListener('click', e => { if (e.target.id === 'helpModal') $('#helpModal').hidden = true; });
$('#btnReset').addEventListener('click', () => {
  if (state.elements.length && !confirm('清空盘面上所有元素？此操作不可撤销。')) return;
  state.elements = []; state.selectedId = null;
  state.disc = { color: '#3a3f45', texture: 'matte' };
  $$('.tpl').forEach(n => n.classList.remove('is-active'));
  syncDiscUI(); markDirty(); render();
  toast('已清空');
});
window.addEventListener('beforeunload', e => {
  if (dirty && state.elements.length) { e.preventDefault(); e.returnValue = ''; }
});

/* ------------------------------------------------------------------
   16. 启动
------------------------------------------------------------------ */
function boot() {
  buildTemplateUI();
  buildAssetUI();
  // 水印素材图标修正（用真实 SVG 渲染）
  $$('#assetRow .asset').forEach((b, i) => {
    b.innerHTML = `<img src="${ASSETS[i].url}" alt="${ASSETS[i].name}" style="width:100%;height:100%;object-fit:contain">`;
  });
  syncDiscUI();
  select(null);
  applyTemplate(TEMPLATES[0], $('.tpl'));
  setZoom(1);
  $('#shell').classList.toggle('is-on', state.showShell);
  render();
}
boot();
