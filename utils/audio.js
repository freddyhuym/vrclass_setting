const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');

let ffmpegPath = 'ffmpeg';
try {
  ffmpegPath = require('ffmpeg-static') || 'ffmpeg';
} catch {
  // 找不到 ffmpeg-static，改用系統 PATH 中的 ffmpeg
}

function convertToWav16kMono(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', '-sample_fmt', 's16', outputPath];
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`ffmpeg 轉檔失敗 (code ${code}): ${stderr.slice(-500)}`));
    });
    proc.on('error', (err) => reject(new Error(`找不到 ffmpeg：${err.message}`)));
  });
}

/** Azure Speech 與 openSMILE 都吃 16k mono wav，統一先轉檔 */
async function ensureWav16k(inputPath, tempDir) {
  await fs.mkdir(tempDir, { recursive: true });
  const base = path.basename(inputPath, path.extname(inputPath));
  const out = path.join(tempDir, `${base}-16k.wav`);
  await convertToWav16kMono(inputPath, out);
  return out;
}

module.exports = { ensureWav16k, convertToWav16kMono };
