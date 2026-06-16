// 「数字方波」logo 精修版 —— 示波器上的二进制方波，右端比特发射
import { writeFileSync } from "node:fs";

const bits = [1, 0, 1, 1, 0];
const x0 = 180, x1 = 724;          // 方波横向范围（右侧留出发射区）
const yHi = 352, yLo = 672;        // 高/低电平：振幅加大占满中央
const yMid = (yHi + yLo) / 2;
const stepW = (x1 - x0) / bits.length;
const WAVE_W = 40;                  // 方波主体线宽（加粗）

// 构造方波路径 + 收集垂直转折点（采样节点）
let d = `M ${x0} ${bits[0] ? yHi : yLo}`;
const edges = [];
for (let i = 0; i < bits.length; i++) {
  const xb = x0 + (i + 1) * stepW;
  const y = bits[i] ? yHi : yLo;
  d += ` L ${xb.toFixed(1)} ${y}`;
  if (i < bits.length - 1) {
    const yNext = bits[i + 1] ? yHi : yLo;
    if (y !== yNext) { d += ` L ${xb.toFixed(1)} ${yNext}`; edges.push([xb, y, yNext]); }
  }
}

// 采样节点（转折点发光）：加大
const nodes = edges.map(([x, ya, yb]) =>
  `<circle cx="${x.toFixed(1)}" cy="${((ya+yb)/2).toFixed(1)}" r="16" fill="#36e0cf" filter="url(#gC)"/>` +
  `<circle cx="${x.toFixed(1)}" cy="${((ya+yb)/2).toFixed(1)}" r="9" fill="#7af6e8"/>`
).join("\n      ");

// 比特标签：去掉（小尺寸看不见，大尺寸添乱）
const labels = "";

// 右端：方波末尾电平 → 离散比特发射飞出（加大，强化“发送”语义）
const endY = bits[bits.length - 1] ? yHi : yLo;
const runners = [
  { x: x1 + 50, y: endY, s: 44, op: 0.95 },
  { x: x1 + 130, y: endY - 10, s: 33, op: 0.72 },
  { x: x1 + 196, y: endY - 22, s: 23, op: 0.5 },
  { x: x1 + 248, y: endY - 36, s: 14, op: 0.3 },
];
const emit = runners.map(({ x, y, s, op }) =>
  `<rect x="${(x - s/2).toFixed(1)}" y="${(y - s/2).toFixed(1)}" width="${s}" height="${s}" rx="${(s*0.22).toFixed(1)}" fill="#ffc24a" opacity="${op}"/>`
).join("\n      ");

const svg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="badge" x1="160" y1="120" x2="864" y2="904" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0f1820"/><stop offset="0.55" stop-color="#0d141a"/><stop offset="1" stop-color="#070b0e"/>
    </linearGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.46" r="0.74" gradientUnits="objectBoundingBox">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.5"/>
    </radialGradient>
    <radialGradient id="scope" cx="0.42" cy="0.5" r="0.6" gradientUnits="objectBoundingBox">
      <stop offset="0" stop-color="#ffb224" stop-opacity="0.1"/><stop offset="1" stop-color="#ffb224" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="58" height="58" patternUnits="userSpaceOnUse">
      <path d="M58 0H0V58" fill="none" stroke="#36e0cf" stroke-opacity="0.05" stroke-width="1.4"/>
    </pattern>
    <linearGradient id="axis" x1="100" y1="0" x2="924" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#36e0cf" stop-opacity="0"/><stop offset="0.5" stop-color="#36e0cf" stop-opacity="0.3"/><stop offset="1" stop-color="#36e0cf" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="waveStroke" x1="${x0}" y1="0" x2="${x1}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffb224"/><stop offset="1" stop-color="#ffce5c"/>
    </linearGradient>
    <filter id="gA" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="12"/></filter>
    <filter id="gC" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>
    <clipPath id="clip"><rect x="64" y="64" width="896" height="896" rx="210"/></clipPath>
  </defs>

  <rect x="64" y="64" width="896" height="896" rx="210" fill="url(#badge)"/>
  <g clip-path="url(#clip)">
    <rect x="64" y="64" width="896" height="896" fill="url(#grid)"/>
    <rect x="64" y="64" width="896" height="896" fill="url(#scope)"/>

    <!-- 中心电压轴 + 刻度 -->
    <line x1="120" y1="${yMid}" x2="904" y2="${yMid}" stroke="url(#axis)" stroke-width="2.5" stroke-dasharray="2 16"/>
    <!-- 高/低电平参考虚线 -->
    <line x1="${x0-30}" y1="${yHi}" x2="${x1+30}" y2="${yHi}" stroke="#ffb224" stroke-opacity="0.12" stroke-width="2" stroke-dasharray="3 12"/>
    <line x1="${x0-30}" y1="${yLo}" x2="${x1+30}" y2="${yLo}" stroke="#ffb224" stroke-opacity="0.12" stroke-width="2" stroke-dasharray="3 12"/>

    <!-- 起点发射指示 -->
    <circle cx="${x0}" cy="${bits[0] ? yHi : yLo}" r="19" fill="#36e0cf" filter="url(#gC)"/>
    <circle cx="${x0}" cy="${bits[0] ? yHi : yLo}" r="11" fill="#7af6e8"/>

    <!-- 方波：外辉光 -->
    <path d="${d}" stroke="#ffb224" stroke-width="${WAVE_W + 8}" stroke-linecap="round" stroke-linejoin="round" fill="none" filter="url(#gA)" opacity="0.6"/>
    <!-- 方波：主体 -->
    <path d="${d}" stroke="url(#waveStroke)" stroke-width="${WAVE_W}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <!-- 方波：高光细芯 -->
    <path d="${d}" stroke="#fff2d4" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.5"/>

    <!-- 采样节点 -->
    <g>
      ${nodes}
    </g>

    <!-- 右端比特发射 -->
    <g filter="url(#gA)" opacity="0.45">
      ${emit}
    </g>
    <g>
      ${emit}
    </g>

    <!-- 比特标签 -->
    <g>
      ${labels}
    </g>

    <rect x="64" y="64" width="896" height="896" fill="url(#vignette)"/>
  </g>

  <rect x="64.5" y="64.5" width="895" height="895" rx="209.5" fill="none" stroke="#fff" stroke-opacity="0.07" stroke-width="1.5"/>
  <rect x="71" y="71" width="882" height="882" rx="203" fill="none" stroke="#ffb224" stroke-opacity="0.14" stroke-width="2"/>
</svg>
`;

writeFileSync(new URL("./app-icon.svg", import.meta.url), svg);
console.log("wrote app-icon.svg");
