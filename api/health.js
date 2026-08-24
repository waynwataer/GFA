function cors(req,res){
  const origin=req.headers.origin||'';
  const allowed=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  const allow=allowed.length?(allowed.includes(origin)?origin:allowed[0]):'*';
  res.setHeader('Access-Control-Allow-Origin',allow);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
}
module.exports=async function handler(req,res){
  cors(req,res);if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  return res.json({ok:true,openai:!!process.env.OPENAI_API_KEY,gemini:!!process.env.GEMINI_API_KEY,groq:!!process.env.GROQ_API_KEY,chat_log:!!process.env.GFA_CHAT_LOG_WEBHOOK,language:'ko-KR'});
};
