/**
 * VR／實驗流程共用的受試者 uid 讀寫（與 public/custom/set-uid.html 一致）
 *
 * 讀取優先序：sessionStorage → localStorage → Cookie
 * 金鑰：sessionStorage/localStorage 為 'vrSessionUid'；Cookie 名為 'vr_session_uid'（path=/）
 */
(function (global) {
  const STORAGE_KEY = 'vrSessionUid';
  const COOKIE_NAME = 'vr_session_uid';
  const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

  function getCookie(name) {
    const m = document.cookie.match(
      new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)')
    );
    return m ? decodeURIComponent(m[1]) : '';
  }

  function setCookie(name, value, maxAge) {
    var s = name + '=' + encodeURIComponent(value || '') + '; path=/; SameSite=Lax';
    if (maxAge > 0) s += '; max-age=' + maxAge;
    document.cookie = s;
  }

  function get() {
    return (
      sessionStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem(STORAGE_KEY) ||
      getCookie(COOKIE_NAME) ||
      ''
    ).trim();
  }

  /**
   * @param {string} uid
   * @param {{ persistDevice?: boolean }} [options] 若為 true，一併寫入 localStorage 與 Cookie（關閉分頁後仍保留）
   */
  function set(uid, options) {
    var v = String(uid || '').trim();
    var persist = options && options.persistDevice;
    sessionStorage.setItem(STORAGE_KEY, v);
    if (persist) {
      if (v) {
        localStorage.setItem(STORAGE_KEY, v);
        setCookie(COOKIE_NAME, v, COOKIE_MAX_AGE);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        setCookie(COOKIE_NAME, '', 0);
      }
    } else {
      localStorage.removeItem(STORAGE_KEY);
      setCookie(COOKIE_NAME, '', 0);
    }
  }

  function clear() {
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    setCookie(COOKIE_NAME, '', 0);
  }

  global.VrSessionUid = {
    get: get,
    set: set,
    clear: clear,
    STORAGE_KEY: STORAGE_KEY,
    COOKIE_NAME: COOKIE_NAME
  };
})(typeof window !== 'undefined' ? window : this);
