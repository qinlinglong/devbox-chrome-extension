const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const [,, inputDir, outputDir] = process.argv;
if (!inputDir || !outputDir) {
  console.error('用法：node store-assets/prepare-store-screenshots.js <生成图目录> <输出目录>');
  process.exit(1);
}

const jobs = [
  ['exec-86c78750-baa1-42f6-9343-956167b515c8.png', 'store-screenshot-01-toolbox.png'],
  ['exec-6517fe09-2bd1-406d-aac4-27336a86e100.png', 'store-screenshot-02-workspace.png']
];
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devbox-store-'));
fs.mkdirSync(outputDir, { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { maxBuffer: 64 * 1024 * 1024, ...options, encoding: options.encoding ?? 'buffer' });
  if (result.status !== 0) throw new Error(`${command} 执行失败：${result.stderr?.toString() || ''}`);
  return result.stdout;
}

function ppmParts(buffer) {
  let offset = 0;
  const tokens = [];
  while (tokens.length < 4) {
    while (buffer[offset] === 10 || buffer[offset] === 13 || buffer[offset] === 32 || buffer[offset] === 9) offset++;
    if (buffer[offset] === 35) { while (buffer[offset] && buffer[offset] !== 10) offset++; continue; }
    const start = offset;
    while (buffer[offset] > 32) offset++;
    tokens.push(buffer.subarray(start, offset).toString('ascii'));
  }
  if (tokens[0] !== 'P6' || tokens[3] !== '255') throw new Error('仅支持 8-bit RGB PPM');
  while (buffer[offset] === 10 || buffer[offset] === 13 || buffer[offset] === 32 || buffer[offset] === 9) offset++;
  return { width: Number(tokens[1]), height: Number(tokens[2]), pixels: buffer.subarray(offset) };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const body = Buffer.concat([name, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  return Buffer.concat([length, body, crc]);
}

function encodeRgbPng(width, height, pixels) {
  const rows = Buffer.alloc(height * (width * 3 + 1));
  for (let row = 0; row < height; row++) {
    const rowStart = row * (width * 3 + 1);
    rows[rowStart] = 0;
    pixels.copy(rows, rowStart + 1, row * width * 3, (row + 1) * width * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2; // 8-bit RGB, no alpha channel
  return Buffer.concat([
    Buffer.from('\x89PNG\r\n\x1a\n', 'binary'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

for (const [sourceName, outputName] of jobs) {
  const source = path.join(inputDir, sourceName);
  const tempJpeg = path.join(tempDir, `${sourceName}.jpg`);
  run('cjpeg', ['-quality', '100', '-rgb', '-outfile', tempJpeg, source]);
  const ppm = run('djpeg', ['-scale', '3/4', '-pnm', tempJpeg]);
  const { width, height, pixels } = ppmParts(ppm);
  const canvasWidth = 1280;
  const canvasHeight = 800;
  const x = Math.floor((canvasWidth - width) / 2);
  const y = Math.floor((canvasHeight - height) / 2);
  if (width > canvasWidth || height > canvasHeight) throw new Error(`${sourceName} 缩放后仍超出画布`);
  const canvas = Buffer.alloc(canvasWidth * canvasHeight * 3, 0);
  for (let i = 0; i < canvas.length; i += 3) { canvas[i] = 250; canvas[i + 1] = 252; canvas[i + 2] = 255; }
  for (let row = 0; row < height; row++) {
    pixels.copy(canvas, ((y + row) * canvasWidth + x) * 3, row * width * 3, (row + 1) * width * 3);
  }
  const header = Buffer.from(`P6\n${canvasWidth} ${canvasHeight}\n255\n`, 'ascii');
  const finalPpm = Buffer.concat([header, canvas]);
  const finalPath = path.join(outputDir, outputName);
  fs.writeFileSync(finalPath, encodeRgbPng(canvasWidth, canvasHeight, canvas));
  console.log(`${outputName}: ${canvasWidth}x${canvasHeight}, 8-bit RGB PNG`);
}
