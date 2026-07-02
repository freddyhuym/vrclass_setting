const mongoose = require('mongoose');

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
    console.log('MongoDB 已連線:', uri);
  } catch (err) {
    console.error('MongoDB 連線失敗:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
