const sdk = require('microsoft-cognitiveservices-speech-sdk');
const fs = require('fs');

const locale = process.env.SPEECH_LOCALE || 'zh-TW';

function isConfigured() {
  return Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
}

function getSpeechConfig() {
  const key = (process.env.AZURE_SPEECH_KEY || '').trim();
  const region = (process.env.AZURE_SPEECH_REGION || '').trim();
  if (!key || !region) {
    throw new Error('請設定 AZURE_SPEECH_KEY 與 AZURE_SPEECH_REGION');
  }
  const config = sdk.SpeechConfig.fromSubscription(key, region);
  config.speechRecognitionLanguage = locale;
  return config;
}

/**
 * 檔案語音辨識：wavPath（16k mono wav）-> { text, latencyMs }
 */
function recognizeFile(wavPath) {
  return new Promise((resolve, reject) => {
    try {
      const speechConfig = getSpeechConfig();
      const audioConfig = sdk.AudioConfig.fromWavFileInput(fs.readFileSync(wavPath));
      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
      const start = Date.now();

      recognizer.recognizeOnceAsync(
        (result) => {
          recognizer.close();
          const latencyMs = Date.now() - start;
          if (result.reason === sdk.ResultReason.RecognizedSpeech) {
            resolve({ provider: 'azure', text: result.text, latencyMs });
          } else if (result.reason === sdk.ResultReason.NoMatch) {
            resolve({ provider: 'azure', text: '', latencyMs, error: 'NoMatch' });
          } else {
            reject(new Error(`Azure 辨識失敗: ${result.errorDetails || result.reason}`));
          }
        },
        (err) => {
          recognizer.close();
          reject(err);
        }
      );
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * 即時串流辨識：持續推送 16kHz mono 16-bit PCM，取得 partial/final 文字。
 * @param {{ onPartial?: (d: {text:string}) => void, onFinal?: (d: {text:string}) => void, onError?: (e: Error) => void }} handlers
 */
function createStreamingSession({ onPartial, onFinal, onError } = {}) {
  const speechConfig = getSpeechConfig();
  speechConfig.setProperty(
    sdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
    '60000'
  );
  speechConfig.setProperty(
    sdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
    '1000'
  );

  const format = sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
  const pushStream = sdk.AudioInputStream.createPushStream(format);
  const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
  const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

  recognizer.recognizing = (_, e) => {
    if (e.result.reason === sdk.ResultReason.RecognizingSpeech) {
      onPartial?.({ text: e.result.text });
    }
  };

  recognizer.recognized = (_, e) => {
    if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
      onFinal?.({
        text: e.result.text,
        offset: Number(e.result.offset),
        duration: Number(e.result.duration),
      });
    }
  };

  recognizer.canceled = (_, e) => {
    if (e.reason === sdk.CancellationReason.Error) {
      onError?.(new Error(e.errorDetails || `Azure 取消: ${e.reason}`));
    }
  };

  let ready = false;

  const startPromise = new Promise((resolve, reject) => {
    const guard = setTimeout(() => {
      reject(new Error('Azure startContinuousRecognitionAsync 逾時（20s）'));
    }, 20000);

    recognizer.startContinuousRecognitionAsync(
      () => {
        clearTimeout(guard);
        ready = true;
        resolve();
      },
      (err) => {
        clearTimeout(guard);
        reject(new Error(err || 'Azure 無法啟動連續辨識'));
      }
    );
  });

  return {
    start() {
      return startPromise;
    },
    write(pcmBuffer) {
      if (!ready) return;
      const ab =
        pcmBuffer instanceof ArrayBuffer
          ? pcmBuffer
          : pcmBuffer.buffer.slice(
              pcmBuffer.byteOffset,
              pcmBuffer.byteOffset + pcmBuffer.byteLength
            );
      pushStream.write(ab);
    },
    stop() {
      pushStream.close();
      return new Promise((resolve) => {
        recognizer.stopContinuousRecognitionAsync(
          () => {
            recognizer.close();
            resolve();
          },
          () => {
            recognizer.close();
            resolve();
          }
        );
      });
    },
  };
}

module.exports = { isConfigured, recognizeFile, createStreamingSession };
