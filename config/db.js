const mongoose = require('mongoose');
const apiDebugLog = require('../utils/apiDebugLog');

// J 追蹤「VR對話資料為什麼沒存進資料庫」：監聽mongoose連線本身的狀態變化。
// 如果測試途中MongoDB連線斷過(disconnected)又重連(reconnected)，這段空窗期間打進來的
// VrConversation.create()就會卡住或失敗——這裡记录下每次狀態變化的時間點，
// 拿去跟Unity那邊「歷程資料送出失敗」的時間點對照，就能確認是不是同一個原因。
mongoose.connection.on('disconnected', () => {
  apiDebugLog.append('[MONGO][警告] 連線中斷(disconnected)，這段期間打進來的寫入請求會失敗或卡住');
});
mongoose.connection.on('reconnected', () => {
  apiDebugLog.append('[MONGO] 已重新連線(reconnected)');
});
mongoose.connection.on('error', (err) => {
  apiDebugLog.append('[MONGO][警告] 連線發生錯誤: ' + err.message);
});

const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vrclass';
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: false,
      useFindAndModify: false,
      useCreateIndex: true,
      family: 4
    });
    apiDebugLog.append('MongoDB 已連線: ' + uri);
  } catch (err) {
    apiDebugLog.append('MongoDB 連線失敗: ' + err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
