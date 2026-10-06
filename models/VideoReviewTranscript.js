const mongoose = require('mongoose');

/**
 * 影片複盤頁（public/custom/video-review.html）用的逐句語音辨識結果。
 * 來源是 VRCLASS 錄製的整段 computer{uid}.wav（電腦/AI 聲音）跟 microphone{uid}.wav（受試者麥克風），
 * 一開啟複盤頁就對這兩個音檔做一次語音辨識（雲端 OpenAI whisper-1，見 providers/openaiSttClient.js；
 * 要準確度優先，取代原本的本機 faster-whisper），逐句(含起訖秒數)存這裡。
 * 跟 Record.js 的 LiveTranscriptSegment 是不同東西：那個是「即時語音辨識」頁面(gptrealtime)當下逐句存的，
 * 這個是「錄好的整段音檔事後轉出來」的，欄位命名跟 uid 慣例（不是 userId）沿用 vrLegacyData 那一套。
 */
const videoReviewTranscriptSegmentSchema = new mongoose.Schema({
  // 跟 Record.js 那幾張表一樣固定給個 type，/data 資料瀏覽頁靠這個欄位分辨要用哪套顯示邏輯。
  type: { type: String, default: 'video_review_transcript' },
  uid: { type: String, required: true, index: true },
  source: { type: String, enum: ['computer', 'microphone'], required: true },
  fileName: String, // 實際辨識的來源檔名，例如 computer43.wav / microphone43.wav（video/ 資料夾底下那個檔案）
  seq: { type: Number, required: true }, // 這個 uid+source 底下第幾句(0起算)，同一音軌內時間遞增
  text: { type: String, required: true },
  startSec: { type: Number, required: true }, // 這句在該音軌裡的起始時間(秒)
  endSec: { type: Number, required: true },
  language: String,
  languageProbability: Number, // 本機 faster-whisper 留下的欄位(整段的語言判斷信心值)，雲端管線不會填
  noSpeechProb: Number, // whisper-1 這句的「很可能沒人講話」機率，越高越可疑，用來事後複查
  avgLogprob: Number    // whisper-1 這句的平均 log 機率，越負代表模型對這句內容越不確定
}, { timestamps: true });

// uid+source+seq 唯一，避免同一段音檔被重複轉錄時插入兩份一樣的逐句紀錄。
videoReviewTranscriptSegmentSchema.index({ uid: 1, source: 1, seq: 1 }, { unique: true });

module.exports = {
  VideoReviewTranscriptSegment: mongoose.model('VideoReviewTranscriptSegment', videoReviewTranscriptSegmentSchema)
};
