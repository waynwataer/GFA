// GFA Jarvis AI compare backend - Vercel Serverless Function
// Gemini + Groq are free-tier-first; OpenAI is optional.
function cors(req,res){
  const origin=req.headers.origin||'';
  const allowed=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  res.setHeader('Access-Control-Allow-Origin',allowed.length?(allowed.includes(origin)?origin:allowed[0]):'*');
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
}
const cut=(v,n=24000)=>String(v==null?'':v).slice(0,n);
function systemPrompt(){return `당신은 Granite Favor Academy(GFA)의 미국 상업용 부동산 입지분석 AI입니다. 반드시 한국어로만 답하세요. 제공된 대시보드 데이터에 없는 사실은 만들지 말고 '확인 필요'라고 표시하세요. Child Care + Authentic Korean Taekwondo 사업 관점에서 입지, 주차/픽드롭, 유효면적, 임대경제성, 학교/가족 배후수요, EEC/조닝 실사, 운영 리스크를 우선 분석하세요.`;}
function userPrompt(q,c){return `질문:\n${cut(q,5000)}\n\n[현재 GFA 대시보드 컨텍스트]\n${cut(JSON.stringify(c,null,2),22000)}\n\n최종 답변은 반드시 한국어로 작성하세요.`;}
function norm(provider,msg){
  const raw=String(msg||'호출 실패'), low=raw.toLowerCase();
  if(low.includes('미설정')||low.includes('not configured'))return {ok:false,provider,error:'Vercel 환경변수에 API 키가 설정되지 않았습니다.',detail:raw,code:'NOT_CONFIGURED'};
  if(low.includes('quota')||low.includes('billing')||low.includes('insufficient_quota')||low.includes('resource_exhausted'))return {ok:false,provider,error:'무료 API 사용 한도 또는 결제/쿼터 설정을 확인해 주세요.',detail:raw,code:'QUOTA'};
  if(low.includes('rate limit')||low.includes('rate_limit')||low.includes('too many requests'))return {ok:false,provider,error:'무료 API의 분당 호출 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.',detail:raw,code:'RATE_LIMIT'};
  if(low.includes('api key')||low.includes('unauthorized')||low.includes('authentication')||low.includes('invalid_api_key')||low.includes('permission_denied'))return {ok:false,provider,error:'API 키 인증 또는 권한 확인이 필요합니다.',detail:raw,code:'AUTH'};
  if(low.includes('model')&&(low.includes('not found')||low.includes('invalid')||low.includes('decommission')))return {ok:false,provider,error:'설정된 AI 모델을 사용할 수 없습니다.',detail:raw,code:'MODEL'};
  return {ok:false,provider,error:'AI 호출 중 오류가 발생했습니다.',detail:raw,code:'OTHER'};
}
async function openaiOnce(model,prompt){
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.OPENAI_API_KEY},body:JSON.stringify({model,input:[{role:'system',content:[{type:'input_text',text:systemPrompt()}]},{role:'user',content:[{type:'input_text',text:prompt}]}],max_output_tokens:1400})});
  const j=await r.json(); if(!r.ok)throw new Error(j.error?.message||('OpenAI HTTP '+r.status));
  let out=j.output_text||''; if(!out&&Array.isArray(j.output))j.output.forEach(o=>(o.content||[]).forEach(x=>{if(x.type==='output_text'&&x.text)out+=x.text;}));
  return out;
}
async function callOpenAI(q,c,custom){
  if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY 미설정');
  // 계정에 따라 최신 모델을 못 쓸 수 있어, Gemini/Groq와 동일하게 폴백 모델을 둔다.
  const models=[process.env.OPENAI_MODEL,'gpt-5.6','gpt-4o-mini'].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
  const prompt=custom||userPrompt(q,c); let last;
  for(const model of models){
    try{const out=await openaiOnce(model,prompt);return {ok:true,provider:'openai',model,text:out||'응답 텍스트가 없습니다.'};}
    catch(e){last=e; const low=String(e.message).toLowerCase(); if(!(low.includes('model')||low.includes('not found')||low.includes('invalid')||low.includes('decommission')))break;}
  }
  throw last||new Error('OpenAI 호출 실패');
}
async function geminiOnce(model,prompt){
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:systemPrompt()}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:1400,temperature:0.3}})});
  const j=await r.json(); if(!r.ok)throw new Error(j.error?.message||('Gemini HTTP '+r.status));
  return (j.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('');
}
async function callGemini(q,c,custom){
  if(!process.env.GEMINI_API_KEY)throw new Error('GEMINI_API_KEY 미설정');
  const models=[process.env.GEMINI_MODEL,'gemini-2.5-flash-lite','gemini-2.5-flash'].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
  const prompt=custom||userPrompt(q,c); let last;
  for(const model of models){
    try{const out=await geminiOnce(model,prompt);return {ok:true,provider:'gemini',model,text:out||'응답 텍스트가 없습니다.'};}
    catch(e){last=e; const low=String(e.message).toLowerCase(); if(!(low.includes('quota')||low.includes('resource_exhausted')||low.includes('rate')||low.includes('model')||low.includes('not found')))break;}
  }
  throw last||new Error('Gemini 호출 실패');
}
async function groqOnce(model,prompt){
  const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.GROQ_API_KEY},body:JSON.stringify({model,messages:[{role:'system',content:systemPrompt()},{role:'user',content:prompt}],max_tokens:1400,temperature:0.3})});
  const j=await r.json(); if(!r.ok)throw new Error(j.error?.message||('Groq HTTP '+r.status));
  return j.choices?.[0]?.message?.content||'';
}
async function callGroq(q,c,custom){
  if(!process.env.GROQ_API_KEY)throw new Error('GROQ_API_KEY 미설정');
  // 주의: llama-3.3-70b-versatile / llama-3.1-8b-instant는 Groq가 2026-06-17
  // 폐기(deprecated) 공지했고 2026-08-16 서비스가 완전히 종료되었다.
  // 공식 권장 대체 모델(openai/gpt-oss-120b, openai/gpt-oss-20b)을 기본값으로 쓴다.
  const models=[process.env.GROQ_MODEL,'openai/gpt-oss-120b','openai/gpt-oss-20b'].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
  const prompt=custom||userPrompt(q,c); let last;
  for(const model of models){
    try{const out=await groqOnce(model,prompt);return {ok:true,provider:'groq',model,text:out||'응답 텍스트가 없습니다.'};}
    catch(e){last=e; const low=String(e.message).toLowerCase(); if(!(low.includes('rate')||low.includes('limit')||low.includes('model')||low.includes('not found')||low.includes('decommission')))break;}
  }
  throw last||new Error('Groq 호출 실패');
}
async function settled(name,fn){try{return await fn();}catch(e){return norm(name,e.message);}}
async function consensus(q,r,c){
  const valid=[r.openai,r.gemini,r.groq].filter(x=>x&&x.ok);
  if(!valid.length)return {ok:false,error:'정상 응답한 AI가 없어 종합판정을 만들 수 없습니다.'};
  if(valid.length===1)return {ok:true,provider:'local',model:'단일 응답',text:`현재 정상 응답한 AI는 1개입니다.\n\n${valid[0].text}`};
  const prompt=`다음 AI 답변들을 비교해 GFA 관점에서 한국어로 종합하라.\n질문: ${cut(q,3000)}\n\nGPT:\n${cut(r.openai?.ok?r.openai.text:'응답 실패',6000)}\n\nGemini:\n${cut(r.gemini?.ok?r.gemini.text:'응답 실패',6000)}\n\nGroq:\n${cut(r.groq?.ok?r.groq.text:'응답 실패',6000)}\n\n① 공통 의견 ② 핵심 이견 ③ 사실확인 필요사항 ④ 최종판정 순서로 작성하라. 실패한 모델은 제외하라.`;
  const candidates=[['gemini',()=>callGemini(q,c,prompt)],['groq',()=>callGroq(q,c,prompt)],['openai',()=>callOpenAI(q,c,prompt)]];
  for(const [n,fn] of candidates)if(r[n]?.ok){try{return await fn();}catch(e){}}
  return {ok:true,provider:'local',model:'fallback',text:'정상 응답한 AI 카드들을 기준으로 판단해 주세요. 종합판정 추가 호출은 실패했습니다.'};
}
module.exports=async function handler(req,res){
  cors(req,res); if(req.method==='OPTIONS')return res.status(204).end(); if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  try{
    const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    const mode=['openai','gemini','groq','compare'].includes(b.mode)?b.mode:'openai'; const q=cut(b.question,5000).trim(); if(!q)return res.status(400).json({error:'질문이 비어 있습니다.'}); const c=b.context||{};
    if(mode==='openai')return res.json({mode,result:await settled('openai',()=>callOpenAI(q,c))});
    if(mode==='gemini')return res.json({mode,result:await settled('gemini',()=>callGemini(q,c))});
    if(mode==='groq')return res.json({mode,result:await settled('groq',()=>callGroq(q,c))});
    const [openai,gemini,groq]=await Promise.all([settled('openai',()=>callOpenAI(q,c)),settled('gemini',()=>callGemini(q,c)),settled('groq',()=>callGroq(q,c))]);
    const results={openai,gemini,groq}; return res.json({mode:'compare',language:'ko-KR',results,consensus:b.synthesize===false?{ok:false,error:'종합판정 비활성화'}:await consensus(q,results,c)});
  }catch(e){return res.status(500).json({error:e.message||'서버 오류'});}
};
