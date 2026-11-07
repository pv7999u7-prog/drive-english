// 開車英文單字本：讓單字本 App 從試算表刪除單字
// 用法：試算表 → 擴充功能 → Apps Script，貼上這段，把 KEY 改成 App 設定頁的刪除密碼，
// 再「部署 → 新增部署作業 → 網頁應用程式」（執行身分：我；存取權：所有人），把網址貼到 App 設定頁。
const KEY = 'CHANGE_ME';

function doPost(e) {
  const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  const lock = LockService.getScriptLock();
  try {
    const p = JSON.parse(e.postData.contents);
    if (KEY === 'CHANGE_ME' || p.key !== KEY) return out({ ok: false, error: '密碼錯誤' });
    if (p.action !== 'delete') return out({ ok: false, error: '不認得的動作' });
    const target = String(p.en || '').trim().toLowerCase();
    if (!target) return out({ ok: false, error: '沒有指定單字' });
    lock.waitLock(10000);
    const sh = SpreadsheetApp.getActive().getSheetByName('單字');
    const n = sh.getLastRow() - 1;
    const vals = n > 0 ? sh.getRange(2, 2, n, 1).getValues() : [];
    let deleted = 0;
    // 從下往上刪，列號才不會跑掉
    for (let i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][0]).trim().toLowerCase() === target) { sh.deleteRow(i + 2); deleted++; }
    }
    return out({ ok: true, deleted });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}
