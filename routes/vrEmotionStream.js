const { WebSocketServer } = require('ws');
const azureSpeech = require('../providers/azureSpeech');

/**
 * 即時語音辨識（WebSocket）。
 * 路徑：ws://<host>:<port>/ws/vr-emotion/stt
 *
 * 協定：
 * - 連上後若 Azure 設定齊全，伺服器會自動啟動辨識 session，成功後送 {type:'ready'}
 * - client 持續傳送 binary frame：16kHz mono 16-bit PCM（無 wav header）
 * - 伺服器邊辨識邊送：{type:'partial', text} / {type:'final', text, audioOffsetTicks, audioDurationTicks}
 *   （offset/duration 為 100-ns tick，可用來從累積的 PCM 串流切出對應該句的音訊）
 * - client 傳文字訊息 {"type":"stop"} 結束辨識（伺服器回 {type:'stopped'} 後可關閉連線）
 * - 發生錯誤送 {type:'error', message}
 */
function attach(server) {
  const wss = new WebSocketServer({ server, path: '/ws/vr-emotion/stt' });

  wss.on('connection', (ws) => {
    let session = null;
    let stopped = false;

    const send = (payload) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    };

    if (!azureSpeech.isConfigured()) {
      send({ type: 'error', message: '伺服器未設定 AZURE_SPEECH_KEY / AZURE_SPEECH_REGION' });
      ws.close();
      return;
    }

    session = azureSpeech.createStreamingSession({
      onPartial: (d) => send({ type: 'partial', text: d.text }),
      onFinal: (d) =>
        send({
          type: 'final',
          text: d.text,
          audioOffsetTicks: d.offset,
          audioDurationTicks: d.duration,
        }),
      onError: (err) => send({ type: 'error', message: err.message || String(err) }),
    });

    session
      .start()
      .then(() => send({ type: 'ready' }))
      .catch((err) => {
        send({ type: 'error', message: err.message || String(err) });
        ws.close();
      });

    ws.on('message', async (data, isBinary) => {
      if (!isBinary) {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'stop' && !stopped) {
            stopped = true;
            await session.stop();
            send({ type: 'stopped' });
          }
        } catch (err) {
          send({ type: 'error', message: err.message || String(err) });
        }
        return;
      }
      if (stopped) return;
      session.write(Buffer.from(data));
    });

    ws.on('close', () => {
      if (!stopped) {
        stopped = true;
        session.stop().catch(() => {});
      }
    });
  });
}

module.exports = { attach };
