/**
 * GFA AI Analyst -> Google Sheets chat logger
 * 1) Google Sheet: 확장 프로그램 > Apps Script
 * 2) 이 코드를 붙여넣고 저장
 * 3) 배포 > 새 배포 > 웹 앱
 *    실행 사용자: 나 / 액세스 권한: 모든 사용자
 * 4) 생성된 /exec URL을 Vercel 환경변수 GFA_CHAT_LOG_WEBHOOK에 저장
 */
const SHEET_NAME = 'AI_Chat_Log';

function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) sh = ss.insertSheet(SHEET_NAME);
    if (sh.getLastRow() === 0) {
      sh.appendRow(['기록시각','세션ID','모드','질문','분석대상','Property ID','매물명','GPT','Gemini','Groq','종합판정','원본JSON']);
      sh.setFrozenRows(1);
    }
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    let r = {}; try { r = JSON.parse(d.response_json || '{}'); } catch(err) {}
    const results = r.results || {};
    const single = r.result || {};
    function resultText(key) {
      if (r.mode === key) return single.ok === false ? ('오류: ' + (single.error || '호출 실패')) : (single.text || '');
      const x = results[key] || {};
      return x.ok === false ? ('오류: ' + (x.error || '호출 실패')) : (x.text || '');
    }
    const consensus = r.consensus || {};
    sh.appendRow([
      new Date(d.timestamp || new Date()), d.session_id || '', d.mode || '', d.question || '', d.context_name || '',
      d.property_id || '', d.property_name || '', resultText('openai'), resultText('gemini'), resultText('groq'),
      consensus.ok === false ? ('오류: ' + (consensus.error || '')) : (consensus.text || ''), d.response_json || ''
    ]);
    return ContentService.createTextOutput(JSON.stringify({ok:true,row:sh.getLastRow()})).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:String(err)})).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ok:true,service:'GFA AI Chat Log'})).setMimeType(ContentService.MimeType.JSON);
}
