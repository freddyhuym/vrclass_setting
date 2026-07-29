const mongoose = require('mongoose');

/**
 * 與舊版 Keystone vrclassroom_cms 相同之 collection 名稱。
 * 只有 EventData（Updatas_Event）是舊專案裡專門收「表單/問卷答案」的 collection，
 * 欄位對照舊版 vrclassroom_cms 的 models/EventData.js 與 Unity 端 UpDataToNode.UpAns() 送出的欄位。
 * 其餘 4 個（LookingData/LookingRangeData/AnimeData/EventLookingData）是准心座標、
 * 注視範圍、動畫播放紀錄，跟表單答案無關，維持原本 strict:false 的萬用 schema。
 */
const { Schema } = mongoose;

function makeLegacySchema() {
  return new Schema({}, { strict: false, timestamps: true });
}

// Unity Select_QA.cs / VR_Controler_Manager.cs 透過 UDTN_Event 送出（QA_Panel 表單答案，專用 collection）
const eventDataSchema = new Schema({
  uid: String,          // 受試者編號
  track: String,        // 第幾軌道
  script_name: String,  // 關卡/劇本名稱
  find_time: String,
  question: String,     // 目前實際傳入的是識別字串，非題目文字本身
  ans: String,           // 作答內容
  ans_options: String,   // 選項清單
  ans_time: String,      // 作答花費時間
  mission_time: String,  // 遊戲總經過時間
  cognitive: String      // 認知評量欄位（目前 Unity 端多半傳空字串）
}, { strict: false, timestamps: true });

const EventLookingData = mongoose.model('EventLookingData', makeLegacySchema(), 'event_lookingdatas');
const LookingData = mongoose.model('LookingData', makeLegacySchema(), 'lookingdatas');
const EventData = mongoose.model('EventData', eventDataSchema, 'eventdatas');
const AnimeData = mongoose.model('AnimeData', makeLegacySchema(), 'animedatas');
const LookingRangeData = mongoose.model('LookingRangeData', makeLegacySchema(), 'lookingrangedatas');

const COLLECTIONS = [
  { key: 'event_lookingdatas', Model: EventLookingData },
  { key: 'lookingdatas', Model: LookingData },
  { key: 'eventdatas', Model: EventData },
  { key: 'animedatas', Model: AnimeData },
  { key: 'lookingrangedatas', Model: LookingRangeData }
];

module.exports = {
  EventLookingData,
  LookingData,
  EventData,
  AnimeData,
  LookingRangeData,
  COLLECTIONS
};
