// Dynamic U.S. Census residential-population proxy for GFA dashboard.
// Determines the current map-center county, then returns ACS Block Groups for that county.
function cors(req,res){const origin=req.headers.origin||'';const a=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);res.setHeader('Access-Control-Allow-Origin',a.length?(a.includes(origin)?origin:a[0]):'*');res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');}
async function fetchJson(url,timeout=18000){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{headers:{'User-Agent':'GFA-Site-Intelligence/2.0','Accept':'application/json'},signal:c.signal});const tx=await r.text();let j;try{j=JSON.parse(tx)}catch(e){throw new Error(`Upstream JSON parse failed (${r.status})`)}if(!r.ok)throw new Error(j.error||`Upstream HTTP ${r.status}`);return j;}finally{clearTimeout(t)}}
function popMap(obj){if(!obj?.data)throw new Error('Census Reporter data response is invalid');const out={};for(const gid of Object.keys(obj.data)){const est=obj.data[gid]?.B01003?.estimate;if(!est)continue;const raw=est.B01003001??est.B01003_001E;const v=Number(raw);if(Number.isFinite(v)&&v>=0)out[gid]=Math.round(v);}if(!Object.keys(out).length)throw new Error('Census Reporter population response is empty');return out;}
function fullGeoId(f){const p=f?.properties||{};return String(p.full_geoid||p.geoid||p.GEOID||p.GEOIDFQ||'');}
function geometryCenter(geom){if(!geom?.coordinates)return null;let sx=0,sy=0,n=0;(function walk(a){if(!Array.isArray(a))return;if(a.length>=2&&typeof a[0]==='number'&&typeof a[1]==='number'){sx+=a[0];sy+=a[1];n++;return;}a.forEach(walk);})(geom.coordinates);return n?{lng:sx/n,lat:sy/n}:null;}
function distanceKm(a,b){const R=6371,toRad=x=>x*Math.PI/180;const dLat=toRad(b.lat-a.lat),dLng=toRad(b.lng-a.lng);const s=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(s));}
const RADIUS_KM=45; // 대형 카운티(예: LA County)에서 과도한 payload를 막기 위한 반경 제한
const STATE_FIPS_ABBR={'01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY','60':'AS','66':'GU','69':'MP','72':'PR','78':'VI'};

/* Census Geocoder — 브라우저 CORS는 막혀 있지만(공식 문서 명시) 서버-서버 호출은 문제 없다. */
async function countyViaCensusGeocoder(lat,lng){
  const u='https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x='+encodeURIComponent(lng)+'&y='+encodeURIComponent(lat)+'&benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties&format=json';
  const j=await fetchJson(u); const geos=j?.result?.geographies||{}; const arr=geos.Counties||geos.counties||[]; const c=arr[0];
  if(!c)throw new Error('현재 지도 중심의 미국 County를 찾지 못했습니다.');
  const state=String(c.STATE||c.STATEFP||'').padStart(2,'0'), county=String(c.COUNTY||c.COUNTYFP||'').padStart(3,'0');
  if(!state||!county)throw new Error('County FIPS를 확인할 수 없습니다.');
  return {state,county,geoid:state+county,name:c.NAME||('County '+state+county)};
}
/* FCC Area API — Census Geocoder가 일시적으로 응답하지 않을 때의 대체 경로(둘 다 서버 호출이라 안전) */
async function countyViaFCC(lat,lng){
  const j=await fetchJson('https://geo.fcc.gov/api/census/area?format=json&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lng));
  const r=j?.results?.[0]; if(!r?.county_fips)throw new Error('FCC 응답에서 County 정보를 찾지 못했습니다.');
  const fips=String(r.county_fips).padStart(5,'0');
  return {state:fips.slice(0,2),county:fips.slice(2),geoid:fips,name:r.county_name||('County '+fips)};
}
async function countyAt(lat,lng){
  try{ return await countyViaCensusGeocoder(lat,lng); }
  catch(e1){
    try{ return await countyViaFCC(lat,lng); }
    catch(e2){ throw new Error('County 판별 실패(Census Geocoder: '+e1.message+' / FCC 대체 경로: '+e2.message+')'); }
  }
}
module.exports=async function handler(req,res){
  cors(req,res); if(req.method==='OPTIONS')return res.status(204).end(); if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  try{
    const lat=Number(req.query.lat??42.7762), lng=Number(req.query.lng??-71.0773); if(!Number.isFinite(lat)||!Number.isFinite(lng))return res.status(400).json({error:'lat/lng가 올바르지 않습니다.'});
    const center={lat,lng};
    const county=await countyAt(lat,lng); const parent='05000US'+county.geoid;
    const dataUrl='https://api.censusreporter.org/1.0/data/show/latest?table_ids=B01003&geo_ids=150%7C'+parent;
    const geoUrl='https://api.censusreporter.org/1.0/geo/show/latest?geo_ids=150%7C'+parent;
    const [data,geo]=await Promise.all([fetchJson(dataUrl),fetchJson(geoUrl)]); if(!Array.isArray(geo?.features))throw new Error('Census Reporter geography response is invalid'); const pop=popMap(data),features=[];
    let totalInCounty=0;
    for(const f of geo.features){
      const p=f.properties||(f.properties={});let gid=fullGeoId(f),v=pop[gid];
      if(v===undefined){const digits=gid.replace(/\D/g,'');const alt='15000US'+digits.slice(-12);if(pop[alt]!==undefined){gid=alt;v=pop[alt];}}
      if(v===undefined)continue;
      totalInCounty++;
      const c=geometryCenter(f.geometry);
      if(c && distanceKm(c,center)>RADIUS_KM)continue; // 대도시권 카운티에서 반대편 끝까지 다 실어오지 않는다
      p.population=v;p.GEOID=gid;p.name=p.display_name||p.name||p.simple_name||('Census Block Group · '+gid);
      features.push(f);
    }
    if(!features.length)throw new Error('해당 County의 Block Group 인구를 매칭하지 못했습니다.');
    const sumPopulation=features.reduce((s,f)=>s+(f.properties.population||0),0);
    res.setHeader('Cache-Control','s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({type:'FeatureCollection',features,_source:'U.S. Census ACS via Census Reporter',_release:data.release?.name||'latest ACS 5-year',_county_geoid:county.geoid,_county_name:county.name,_state_abbr:STATE_FIPS_ABBR[county.state]||'',_center:{lat,lng},_radius_km:RADIUS_KM,_total_in_county:totalInCounty,_sum_population:sumPopulation});
  }catch(e){return res.status(502).json({error:e.message||'Population proxy failed'});}
};
