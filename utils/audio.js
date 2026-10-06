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

/**
 * 轉成 16kHz 單聲道 mp3（給雲端 STT 上傳用，OpenAI /audio/transcriptions 限制單檔 25MB）。
 * VRCLASS 錄的原始 wav 是 44.1k/48k、可能雙聲道，整段 VR session 動輒十幾二十分鐘，沒壓縮的話
 * 隨便就超過 25MB。48kbps 對純語音（非音樂）品質損失可忽略，辨識準確度不受影響，
 * 但檔案大小可以壓到約 1/25，一小時語音約 21MB，一般 session 長度都在限制內。
 */
function convertToCompressedMono(inputPath, outputPath, bitrateKbps = 48) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-i', inputPath,
      '-ar', '16000', '-ac', '1',
      '-c:a', 'libmp3lame', '-b:a', `${bitrateKbps}k`,
      outputPath
    ];
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

/**
 * 把音檔切成固定長度的多個片段（保底用：極少數超長 session 壓縮後還是超過雲端 API 檔案大小上限時）。
 * `-c copy` 只切容器、不重新編碼，快，且不會二次破壞音質；用 mp3 stream copy 在片段邊界可能有幾十毫秒
 * 誤差，對「一句話大概幾秒開始」這種用途可接受。回傳依片段順序排好的檔案路徑陣列。
 */
async function splitAudioIntoChunks(inputPath, tempDir, segmentSec) {
  const base = path.basename(inputPath, path.extname(inputPath));
  const ext = path.extname(inputPath) || '.mp3';
  const pattern = path.join(tempDir, `${base}-chunk-%03d${ext}`);
  await new Promise((resolve, reject) => {
    const args = ['-y', '-i', inputPath, '-f', 'segment', '-segment_time', String(segmentSec), '-c', 'copy', pattern];
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg 切割失敗 (code ${code}): ${stderr.slice(-500)}`));
    });
    proc.on('error', (err) => reject(new Error(`找不到 ffmpeg：${err.message}`)));
  });
  const prefix = `${base}-chunk-`;
  const files = (await fs.readdir(tempDir))
    .filter((f) => f.startsWith(prefix) && f.endsWith(ext))
    .sort();
  return files.map((f) => path.join(tempDir, f));
}

module.exports = { ensureWav16k, convertToWav16kMono, convertToCompressedMono, splitAudioIntoChunks };
