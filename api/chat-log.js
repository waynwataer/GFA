// /api/chat-log.js
// Optional Google Sheet logging via Google Apps Script Web App.
// Environment variable: GFA_CHAT_LOG_WEBHOOK=https://script.google.com/macros/s/.../exec

function cors(req,res){
  const origin=req.headers.origin||'';
  const a=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  res.setHeader('Access-Control-Allow-Origin',a.length?(a.includes(origin)?origin:a[0]):'*');
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
}
function safe(v,max=50000){return String(v==null?'':v).slice(0,max);}
module.exports=async function handler(req,res){
  // CORS 헤더를 가장 먼저, 그리고 이후 어떤 코드가 예외를 던지더라도
  // 이미 설정되어 있도록 한다. 헤더가 누락되면 브라우저가 응답 자체를
  // 숨기고 fetch()가 "Failed to fetch"로 실패해, 실제로는 서버가 정상
  // 응답했더라도 클라이언트에서는 원인을 알 수 없는 네트워크 오류로 보인다.
  try{
    cors(req,res);
  }catch(e){
    // 헤더 설정 자체가 실패하는 극단적 경우에도 최소한의 CORS를 강제로 시도
    try{ res.setHeader('Access-Control-Allow-Origin','*'); }catch(e2){}
  }
  try{
    if(req.method==='OPTIONS')return res.status(204).end();
    const hook=(process.env.GFA_CHAT_LOG_WEBHOOK||'').trim();
    if(req.method==='GET')return res.status(200).json({ok:true,configured:!!hook});
    if(req.method!=='POST')return res.status(405).json({error:'GET/POST only'});
    if(!hook)return res.status(200).json({ok:true,configured:false,logged:false});
    const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    const payload={
      session_id:safe(b.session_id,120),timestamp:safe(b.timestamp,80),mode:safe(b.mode,40),
      question:safe(b.question,5000),context_name:safe(b.context_name,300),property_id:safe(b.property_id,120),property_name:safe(b.property_name,300),
      response_json:safe(JSON.stringify(b.response||{}),45000)
    };
    const r=await fetch(hook,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),redirect:'follow'});
    const txt=await r.text();
    if(!r.ok)throw new Error('Google Apps Script HTTP '+r.status+' '+txt.slice(0,200));
    let out={}; try{out=JSON.parse(txt);}catch(e){out={ok:true};}
    return res.status(200).json({ok:true,configured:true,logged:out.ok!==false});
  }catch(e){
    // 여기서도 반드시 JSON + CORS 헤더가 붙은 응답을 보장한다(플랫폼 기본
    // 오류 페이지가 나가면 CORS 헤더가 없어 브라우저가 차단할 수 있다).
    return res.status(502).json({ok:false,configured:true,logged:false,error:String((e&&e.message)||e)});
  }
};
