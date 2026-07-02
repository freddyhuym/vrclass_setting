/**
 * 實驗步驟排序：先比 order，再比 key 的 stepN 數字（與 /api/experiments/flow 一致）
 */
(function (g) {
  g.flowStepKeyNum = function (key) {
    var m = /^step(\d+)$/i.exec(String(key || ''));
    return m ? parseInt(m[1], 10) : 1e9;
  };
  g.compareFlowSteps = function (a, b) {
    var oa = a.order != null ? Number(a.order) : 0;
    var ob = b.order != null ? Number(b.order) : 0;
    if (oa !== ob) return oa - ob;
    return g.flowStepKeyNum(a.key) - g.flowStepKeyNum(b.key);
  };
})(typeof window !== 'undefined' ? window : this);
