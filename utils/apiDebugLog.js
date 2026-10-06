// J 追蹤「VR對話資料為什麼沒存進資料庫」用的除錯log：
// 除了印到console(視窗開著才看得到)，也同步寫進檔案，這樣測試結束後不管當下有沒有盯著主控台，
// 都能事後把這個檔案的時間戳記拿去跟 Unity 那邊的 VRCLASS_recording_debug_log.txt 對照，
// 確認同一個時間點兩邊各自發生了什麼事。
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'video'); // 跟Unity寫的wav/mp4放同一個資料夾，方便一起找
const LOG_PATH = path.join(LOG_DIR, 'api_debug_log.txt');

function append(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch (e) {
    // 寫檔失敗不能讓這次API請求跟著炸掉，只印到console就好
    console.error('[apiDebugLog] 寫入log檔失敗:', e.message);
  }
}

module.exports = { append, LOG_PATH };
