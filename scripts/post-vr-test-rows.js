/**
 * 對五個 VR 上傳端點各送一筆 application/x-www-form-urlencoded 測試資料。
 * 使用前請先啟動 server（預設 PORT 見 .env）。
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const http = require('http');
const querystring = require('querystring');

const port = parseInt(process.env.PORT || '4000', 10);
const base = '/auth/api/vr_classsroom';

const posts = [
  {
    path: '/Updatas_Event_Looking',
    body: {
      apikey: 'test',
      uid: 'u-demo',
      mission_id: 'm1',
      event_id: 'e1',
      find_time: '100',
      point_x: '0.1',
      point_y: '0.2',
      point_z: '0.3',
      test_marker: 'seed_event_looking'
    }
  },
  {
    path: '/Updatas_Looking',
    body: {
      apikey: 'test',
      uid: 'u-demo',
      mission_id: 'm1',
      looking_x: '10',
      looking_y: '20',
      looking_z: '30',
      test_marker: 'seed_looking'
    }
  },
  {
    path: '/Updatas_Event',
    body: {
      apikey: 'test',
      uid: 'u-demo',
      mission_id: 'm1',
      event_id: 'e2',
      trigger: 'click',
      test_marker: 'seed_event'
    }
  },
  {
    path: '/Updatas_Anime',
    body: {
      apikey: 'test',
      uid: 'u-demo',
      mission_id: 'm1',
      event_id: 'e1',
      anime_tag: 'demo',
      time_scale: '1',
      seat_number: '3',
      test_marker: 'seed_anime'
    }
  },
  {
    path: '/Updatas_LookingRange',
    body: {
      apikey: 'test',
      uid: 'u-demo',
      mission_id: 'm1',
      event_id: 'e1',
      x: '1',
      y: '2',
      z: '3',
      point: 'A1',
      test_marker: 'seed_looking_range'
    }
  }
];

function postOne({ path: p, body }) {
  return new Promise((resolve, reject) => {
    const data = querystring.stringify(body);
    const opts = {
      hostname: '127.0.0.1',
      port,
      path: base + p,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        resolve({ path: p, status: res.statusCode, body: raw });
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  for (const item of posts) {
    try {
      const r = await postOne(item);
      console.log(r.status, item.path, r.body);
    } catch (e) {
      console.error('FAIL', item.path, e.message);
      process.exitCode = 1;
    }
  }
})();
