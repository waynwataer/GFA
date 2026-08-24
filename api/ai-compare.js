// GFA 자비스(Jarvis) AI 백엔드 - Vercel Serverless Function
// 단일 제공사(OpenAI/GPT)만 사용한다. 예전에는 Gemini/Groq와 비교(compare) 모드가
// 있었으나, 어느 AI가 답했는지 헷갈린다는 피드백을 받아 자비스 하나로 단순화했다.
function cors(req,res){
  const origin=req.headers.origin||'';
  const allowed=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  res.setHeader('Access-Control-Allow-Origin',allowed.length?(allowed.includes(origin)?origin:allowed[0]):'*');
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
}
const cut=(v,n=24000)=>String(v==null?'':v).slice(0,n);
function systemPrompt(){return `당신은 Granite Favor Academy(GFA)의 미국 상업용 부동산 입지분석 AI '자비스'입니다. 반드시 한국어로만 답하세요. 제공된 대시보드 데이터에 없는 사실은 만들지 말고 '확인 필요'라고 표시하세요. Child Care + Authentic Korean Taekwondo 사업 관점에서 입지, 주차/픽드롭, 유효면적, 임대경제성, 학교/가족 배후수요(졸업률 포함), 지역 안전(범죄지표), EEC/조닝 실사, 운영 리스크를 우선 분석하세요.`;}
function userPrompt(q,c){return `질문:\n${cut(q,5000)}\n\n[현재 GFA 대시보드 컨텍스트]\n${cut(JSON.stringify(c,null,2),22000)}\n\n최종 답변은 반드시 한국어로 작성하세요.`;}
function norm(msg){
  const raw=String(msg||'호출 실패'), low=raw.toLowerCase();
  if(low.includes('미설정')||low.includes('not configured'))return {ok:false,provider:'jarvis',error:'Vercel 환경변수에 API 키가 설정되지 않았습니다.',detail:raw,code:'NOT_CONFIGURED'};
  if(low.includes('quota')||low.includes('billing')||low.includes('insufficient_quota')||low.includes('resource_exhausted'))return {ok:false,provider:'jarvis',error:'API 사용 한도 또는 결제/쿼터 설정을 확인해 주세요.',detail:raw,code:'QUOTA'};
  if(low.includes('rate limit')||low.includes('rate_limit')||low.includes('too many requests'))return {ok:false,provider:'jarvis',error:'API의 분당 호출 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',detail:raw,code:'RATE_LIMIT'};
  if(low.includes('api key')||low.includes('unauthorized')||low.includes('authentication')||low.includes('invalid_api_key')||low.includes('permission_denied'))return {ok:false,provider:'jarvis',error:'API 키 인증 또는 권한 확인이 필요합니다.',detail:raw,code:'AUTH'};
  if(low.includes('model')&&(low.includes('not found')||low.includes('invalid')||low.includes('decommission')))return {ok:false,provider:'jarvis',error:'설정된 AI 모델을 사용할 수 없습니다.',detail:raw,code:'MODEL'};
  return {ok:false,provider:'jarvis',error:'AI 호출 중 오류가 발생했습니다.',detail:raw,code:'OTHER'};
}
async function openaiOnce(model,prompt){
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.OPENAI_API_KEY},body:JSON.stringify({model,input:[{role:'system',content:[{type:'input_text',text:systemPrompt()}]},{role:'user',content:[{type:'input_text',text:prompt}]}],max_output_tokens:1400})});
  const j=await r.json(); if(!r.ok)throw new Error(j.error?.message||('OpenAI HTTP '+r.status));
  let out=j.output_text||''; if(!out&&Array.isArray(j.output))j.output.forEach(o=>(o.content||[]).forEach(x=>{if(x.type==='output_text'&&x.text)out+=x.text;}));
  return out;
}
async function callJarvis(q,c){
  if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY 미설정');
  // 계정에 따라 최신 모델을 못 쓸 수 있어 폴백 모델을 둔다.
  const models=[process.env.OPENAI_MODEL,'gpt-5.6','gpt-4o-mini'].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
  const prompt=userPrompt(q,c); let last;
  for(const model of models){
    try{const out=await openaiOnce(model,prompt);return {ok:true,provider:'jarvis',model,text:out||'응답 텍스트가 없습니다.'};}
    catch(e){last=e; const low=String(e.message).toLowerCase(); if(!(low.includes('model')||low.includes('not found')||low.includes('invalid')||low.includes('decommission')))break;}
  }
  throw last||new Error('자비스 호출 실패');
}
module.exports=async function handler(req,res){
  cors(req,res); if(req.method==='OPTIONS')return res.status(204).end(); if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  try{
    const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    const q=cut(b.question,5000).trim(); if(!q)return res.status(400).json({error:'질문이 비어 있습니다.'});
    const c=b.context||{};
    let result;
    try{ result=await callJarvis(q,c); }
    catch(e){ result=norm(e.message); }
    return res.json({mode:'jarvis',result});
  }catch(e){return res.status(500).json({error:e.message||'서버 오류'});}
};
