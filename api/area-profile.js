// GFA 자비스 백엔드 — 도시 종합 프로파일 (/api/area-profile)
// 임의의 미국 도시에 대해 주거인구 + 공립학교 + 범죄율을 한 번에 조립해 반환한다.
//   · 주거인구 : U.S. Census ACS 5-year (place 단위) — 키 불필요
//   · 학교     : NCES CCD Directory (Urban Institute Education Data Portal) — 키 불필요
//   · 범죄     : FBI Crime Data Explorer(CDE) — FBI_API_KEY 가 있을 때만 실시간,
//                없으면 available:false 로 돌려주고 프런트가 내장 참고값으로 보완한다.
// 설계 원칙: 없는 값은 지어내지 않는다. 각 블록은 available 플래그와 source/year를
//            명시하고, 실패 사유(error)를 그대로 실어 보내 프런트가 fallback 여부를
//            사용자에게 투명하게 보여줄 수 있게 한다.

function cors(req, res) {
  const origin = req.headers.origin || '';
  const a = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  res.setHeader('Access-Control-Allow-Origin', a.length ? (a.includes(origin) ? origin : a[0]) : '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
}

async function fetchJson(url, timeout = 15000, headers) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, {
      headers: Object.assign({ 'User-Agent': 'GFA-Site-Intelligence/3.0', 'Accept': 'application/json' }, headers || {}),
      signal: c.signal
    });
    const tx = await r.text();
    let j; try { j = JSON.parse(tx); } catch (e) { throw new Error(`Upstream JSON parse failed (${r.status})`); }
    if (!r.ok) throw new Error((j && (j.error || j.message)) || `Upstream HTTP ${r.status}`);
    return j;
  } finally { clearTimeout(t); }
}

const STATE_FIPS = {
  AL:'01',AK:'02',AZ:'04',AR:'05',CA:'06',CO:'08',CT:'09',DE:'10',DC:'11',FL:'12',GA:'13',HI:'15',
  ID:'16',IL:'17',IN:'18',IA:'19',KS:'20',KY:'21',LA:'22',ME:'23',MD:'24',MA:'25',MI:'26',MN:'27',
  MS:'28',MO:'29',MT:'30',NE:'31',NV:'32',NH:'33',NJ:'34',NM:'35',NY:'36',NC:'37',ND:'38',OH:'39',
  OK:'40',OR:'41',PA:'42',RI:'44',SC:'45',SD:'46',TN:'47',TX:'48',UT:'49',VT:'50',VA:'51',WA:'53',
  WV:'54',WI:'55',WY:'56',PR:'72'
};

/* ── 1) 주거인구 : ACS place 단위 ──────────────────────────────
   Census ACS는 place 이름을 정확히 요구하므로, 도시 이름으로 place 목록을 받아
   가장 근접한 "<City> city/town" 을 고른다. */
async function fetchPopulation(city, stateAbbr) {
  const stFips = STATE_FIPS[stateAbbr];
  if (!stFips) throw new Error('알 수 없는 주(State) 약어: ' + stateAbbr);
  const years = [2023, 2022, 2021]; // 최신 ACS 5-year 우선, 순차 폴백
  let lastErr;
  for (const yr of years) {
    try {
      const url = `https://api.census.gov/data/${yr}/acs/acs5?get=NAME,B01003_001E&for=place:*&in=state:${stFips}`;
      const rows = await fetchJson(url, 15000);
      if (!Array.isArray(rows) || rows.length < 2) throw new Error('ACS place 응답이 비었습니다.');
      const header = rows[0], idxName = header.indexOf('NAME'), idxPop = header.indexOf('B01003_001E');
      const want = String(city).trim().toLowerCase();
      let best = null;
      for (let i = 1; i < rows.length; i++) {
        const nm = String(rows[i][idxName] || '');           // 예: "Brockton city, Massachusetts"
        const placeName = nm.split(',')[0].toLowerCase();     // "brockton city"
        const bare = placeName.replace(/\s+(city|town|village|cdp|borough|municipality)$/,'').trim();
        if (bare === want) { best = rows[i]; break; }
        if (!best && bare.startsWith(want)) best = rows[i];    // 부분 일치 후보 보관
      }
      if (!best) throw new Error(`"${city}, ${stateAbbr}" 에 해당하는 Census place를 찾지 못했습니다.`);
      const val = Number(best[idxPop]);
      return {
        available: true,
        value: Number.isFinite(val) ? val : null,
        name: String(best[idxName]).split(',')[0],
        year: `${yr} ACS 5-year`,
        source: 'U.S. Census ACS 5-year (place)'
      };
    } catch (e) { lastErr = e; }
  }
  return { available: false, value: null, error: (lastErr && lastErr.message) || '인구 조회 실패', source: 'U.S. Census ACS' };
}

/* ── 2) 학교 : NCES CCD Directory (Urban Institute) ─────────────
   city_location + state fips 로 필터. CCD 최신 연도는 2022. */
async function fetchSchools(city, stateAbbr) {
  const stFips = STATE_FIPS[stateAbbr];
  if (!stFips) throw new Error('알 수 없는 주(State) 약어: ' + stateAbbr);
  const years = [2022, 2021, 2020];
  const wantCity = String(city).trim().toLowerCase();
  let lastErr;
  for (const yr of years) {
    try {
      // fips 로 1차 필터 후, city_location 으로 코드단 정밀 필터 (도시명 표기 편차 대비)
      let url = `https://educationdata.urban.org/api/v1/schools/ccd/directory/${yr}/?fips=${parseInt(stFips,10)}&city_location=${encodeURIComponent(city)}`;
      let acc = [], guard = 0;
      while (url && guard < 6) {
        const j = await fetchJson(url, 15000);
        if (Array.isArray(j.results)) acc = acc.concat(j.results);
        url = j.next || '';
        guard++;
      }
      // city_location 필터가 대소문자/표기차로 빗나갈 수 있어 클라이언트단 재확인
      const rows = acc.filter(s => String(s.city_location || '').trim().toLowerCase() === wantCity);
      const use = rows.length ? rows : acc;
      if (!use.length) throw new Error('해당 도시의 CCD 학교 레코드가 없습니다.');
      const counts = { all: 0, elem: 0, mid: 0, high: 0, other: 0 };
      let enroll = 0, enrollKnown = false;
      const named = [];
      use.forEach(s => {
        // 운영 중(charter 포함)인 정규학교만 집계
        const status = Number(s.school_status);
        if (status === 2 || status === 6 || status === 7) return; // 폐교/미개교/추가예정 제외
        counts.all++;
        const lvl = Number(s.school_level); // 1 초, 2 중, 3 고, 4 기타
        if (lvl === 1) counts.elem++; else if (lvl === 2) counts.mid++;
        else if (lvl === 3) counts.high++; else counts.other++;
        const e = Number(s.enrollment);
        if (Number.isFinite(e) && e >= 0) { enroll += e; enrollKnown = true; }
        if (s.school_name) named.push({ name: s.school_name, level: lvl, enrollment: Number.isFinite(e) ? e : null });
      });
      named.sort((a, b) => (b.enrollment || 0) - (a.enrollment || 0));
      return {
        available: true,
        counts,
        total_enrollment: enrollKnown ? enroll : null,
        schools: named.slice(0, 8),
        year: `${yr} CCD`,
        source: 'NCES CCD · Urban Institute Education Data Portal'
      };
    } catch (e) { lastErr = e; }
  }
  return { available: false, error: (lastErr && lastErr.message) || '학교 조회 실패', source: 'NCES CCD' };
}

/* ── 3) 범죄 : FBI Crime Data Explorer (선택) ───────────────────
   FBI_API_KEY 가 있어야 하고, 도시→ORI 매핑이 필요해 신뢰도가 낮다.
   키가 없으면 available:false 로 두어 프런트가 내장 참고값(AreaVibes 등)으로
   대체하고 그 사실을 화면에 명시하게 한다. */
async function fetchCrime(city, stateAbbr) {
  const key = process.env.FBI_API_KEY;
  if (!key) return { available: false, error: 'FBI_API_KEY 미설정 — 참고값으로 대체됩니다.', source: 'FBI CDE' };
  try {
    // 주(State) 단위 요약만 키로 안정적으로 조회 가능. 도시 단위는 ORI 필요.
    const yr = 2023;
    const base = 'https://api.usa.gov/crime/fbi/cde';
    const vio = await fetchJson(`${base}/estimate/state/${stateAbbr}/${yr}/${yr}?API_KEY=${key}`, 15000);
    // 응답 구조가 버전에 따라 달라 방어적으로 파싱
    const rec = (vio && (vio.results || vio.data || []))[0] || {};
    const pop = Number(rec.population) || null;
    const v = Number(rec.violent_crime), p = Number(rec.property_crime);
    const per = (n) => (pop && Number.isFinite(n)) ? Math.round(n / pop * 100000) : null;
    return {
      available: true,
      scope: 'state', // 주의: 도시가 아닌 주(State) 단위 추정치
      year: String(yr),
      agency: stateAbbr + ' (주 단위 추정)',
      violent: { rate: per(v) },
      property: { rate: per(p) },
      source: 'FBI Crime Data Explorer (state estimate)'
    };
  } catch (e) {
    return { available: false, error: e.message || 'FBI CDE 조회 실패', source: 'FBI CDE' };
  }
}

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  try {
    const city = String(req.query.city || '').trim();
    const state = String(req.query.state || '').trim().toUpperCase();
    if (!city || !state) return res.status(400).json({ error: 'city 와 state 파라미터가 필요합니다.' });

    // 세 소스를 병렬 조회하되 하나가 실패해도 나머지는 반환 (allSettled)
    const [pop, sch, cri] = await Promise.allSettled([
      fetchPopulation(city, state),
      fetchSchools(city, state),
      fetchCrime(city, state)
    ]);
    const val = (s, fb) => s.status === 'fulfilled' ? s.value : fb;

    const profile = {
      _mode: 'live',
      geography: { city, state },
      population: val(pop, { available: false, value: null, error: 'population task failed', source: 'U.S. Census ACS' }),
      schools: val(sch, { available: false, error: 'schools task failed', source: 'NCES CCD' }),
      crime: val(cri, { available: false, error: 'crime task failed', source: 'FBI CDE' })
    };
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json(profile);
  } catch (e) {
    return res.status(502).json({ error: e.message || 'area-profile failed' });
  }
};
