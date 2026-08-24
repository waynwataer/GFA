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
  cors(req,res); if(req.method==='OPTIONS')return res.status(204).end();
  const hook=(process.env.GFA_CHAT_LOG_WEBHOOK||'').trim();
  if(req.method==='GET')return res.json({ok:true,configured:!!hook});
  if(req.method!=='POST')return res.status(405).json({error:'GET/POST only'});
  if(!hook)return res.json({ok:true,configured:false,logged:false});
  try{
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
    return res.json({ok:true,configured:true,logged:out.ok!==false});
  }catch(e){return res.status(502).json({ok:false,configured:true,logged:false,error:e.message});}
};
