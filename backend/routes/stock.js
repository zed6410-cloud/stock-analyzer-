import express from 'express';
import axios from 'axios';
import { searchKrStocks } from '../data/krStocks.js';
import { searchUsStocksKr } from '../data/usStocksKr.js';

const router = express.Router();

function hasKorean(text) {
  return /[가-힣]/.test(text);
}

// ETF/ETN 등 파생상품 브랜드명이 섞인 결과 제외 (예: "KODEX 삼성전자단일종목레버리지")
const FUND_BRAND_RE = /^(KODEX|TIGER|ACE|RISE|KIWOOM|KBSTAR|HANARO|SOL|미래에셋|삼성자산운용|한투|파워)\s/;

// 네이버 증권 자동완성 API로 한글 종목명을 실시간으로 검색 (미국/한국 주식 전체 커버, 별도 유지보수 목록 불필요)
async function searchNaver(query) {
  const res = await axios.get('https://ac.stock.naver.com/ac', {
    params: { q: query, target: 'stock' },
    headers: { 'User-Agent': YF_UA },
    timeout: 5000,
  });
  const items = res.data?.items || [];

  const EXCHANGE_MAP = {
    KOSPI: 'KSC', KOSDAQ: 'KOE', KONEX: 'KNX',
    NASDAQ: 'NMS', NYSE: 'NYQ', AMEX: 'ASE',
  };

  return items
    .filter(it => it.category === 'stock' && EXCHANGE_MAP[it.typeCode] && !FUND_BRAND_RE.test(it.name))
    .map(it => {
      let symbol = it.code;
      if (it.nationCode === 'KOR') {
        symbol = `${it.code}${it.typeCode === 'KOSDAQ' ? '.KQ' : '.KS'}`;
      }
      return { symbol, name: it.name, exchange: EXCHANGE_MAP[it.typeCode] };
    });
}

const YF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 간단한 인메모리 캐시: Yahoo 요청 횟수를 줄여 429(Too Many Requests) 차단을 방지
const _cache = new Map();
function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) { _cache.delete(key); return undefined; }
  return hit.value;
}
function cacheSet(key, value, ttlMs) {
  _cache.set(key, { value, expires: Date.now() + ttlMs });
}
// 만료 여부와 상관없이 마지막으로 성공한 값을 반환 (429 등으로 새로 못 받아올 때 대체용)
function cacheGetStale(key) {
  return _cache.get(key)?.value;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 429(요청 과다) 응답 시 짧게 대기 후 1회 재시도
// Render 공용 IP가 Yahoo에 지속적으로 차단되는 경우가 많아, 재시도 횟수를 줄여
// 실패를 빠르게 확정하고 캐시/대체 소스로 넘어가도록 함 (긴 재시도는 느린 로딩만 유발)
async function withRetry429(fn, retries = 1, delayMs = 500) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e.response?.status === 429 && i < retries) {
        await sleep(delayMs * (i + 1));
        continue;
      }
      throw e;
    }
  }
}

let _crumb = null;
let _cookies = null;
let _crumbTime = 0;
let _crumbPromise = null;

// 순수 Node/axios 기반 인증 (curl 불필요, 모든 OS에서 동작)
// 동시 요청 시 쿠키/크럼이 꼬이지 않도록 진행 중인 fetch를 공유(in-flight promise 캐싱)
async function ensureCrumb() {
  if (_crumb && Date.now() - _crumbTime < 25 * 60 * 1000) return { crumb: _crumb, cookies: _cookies };
  if (_crumbPromise) return _crumbPromise;

  _crumbPromise = (async () => {
    const r1 = await axios.get('https://fc.yahoo.com', {
      headers: { 'User-Agent': YF_UA },
      maxRedirects: 0,
      validateStatus: () => true,
    });
    const cookies = (r1.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

    const r2 = await axios.get('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': YF_UA, Cookie: cookies },
    });

    _cookies = cookies;
    _crumb = r2.data;
    _crumbTime = Date.now();
    console.log('YF crumb 획득:', String(_crumb).slice(0, 6) + '...');
    return { crumb: _crumb, cookies: _cookies };
  })();

  try {
    return await _crumbPromise;
  } finally {
    _crumbPromise = null;
  }
}

async function yfAuthed(url, params = {}) {
  return withRetry429(async () => {
    const { crumb, cookies } = await ensureCrumb();
    const res = await axios.get(url, {
      params: { ...params, crumb },
      headers: { 'User-Agent': YF_UA, Cookie: cookies },
    });
    return res.data;
  });
}

// Finnhub 무료 API (미국 주식 PER/베타/시가총액 등 - Yahoo 429 차단 회피용, 카드등록 불필요)
async function getFinnhubMetrics(symbol) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  const cacheKey = `finnhub:${symbol}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const res = await axios.get('https://finnhub.io/api/v1/stock/metric', {
    params: { symbol, metric: 'all', token: key },
    timeout: 5000,
  });
  const m = res.data?.metric || {};
  if (!m.peTTM && !m.beta) return null;

  const result = {
    marketCap: m.marketCapitalization ? m.marketCapitalization * 1e6 : undefined,
    trailingPE: m.peTTM,
    forwardPE: m.forwardPE,
    dividendYield: m.dividendYieldIndicatedAnnual ? m.dividendYieldIndicatedAnnual / 100 : undefined,
    beta: m.beta,
    epsTrailingTwelveMonths: m.epsTTM,
  };
  cacheSet(cacheKey, result, 4 * 60 * 60 * 1000);
  return result;
}

// Yahoo Finance v8 차트 (인증 불필요) - 짧은 캐시로 중복 요청 방지
async function getChart(symbol, range = '1y', interval = '1d') {
  const cacheKey = `chart:${symbol}:${range}:${interval}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const result = await withRetry429(async () => {
    const res = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
      headers: { 'User-Agent': YF_UA },
      params: { interval, range, includePrePost: false },
    });
    return res.data.chart?.result?.[0];
  });

  cacheSet(cacheKey, result, 60 * 1000);
  return result;
}

// 환율 (원화 환산가 표시용, 인증 불필요)
router.get('/exchange-rate/:pair', async (req, res) => {
  try {
    const { pair } = req.params; // 예: USDKRW
    const result = await getChart(`${pair}=X`, '5d', '1d');
    if (!result) return res.status(404).json({ error: '환율 정보를 찾을 수 없습니다' });
    res.json({ rate: result.meta.regularMarketPrice });
  } catch (err) {
    console.error('exchange-rate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 종목 검색 (나스닥/코스닥/코스피 등 전세계 상장 종목 대상)
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: '검색어를 입력하세요' });

    // 네이버 증권 실시간 검색을 1순위로 사용 (한글/영문 모두 지원, 전세계 종목 커버, Yahoo 429/크럼 지연 회피)
    try {
      const cacheKey = `naversearch:${q}`;
      let naverResults = cacheGet(cacheKey);
      if (naverResults === undefined) {
        naverResults = await searchNaver(q);
        cacheSet(cacheKey, naverResults, 10 * 60 * 1000);
      }
      if (naverResults.length > 0) return res.json(naverResults.slice(0, 15));
    } catch (e) {
      console.log('네이버 검색 실패, 대체 소스로 전환:', e.message);
    }

    if (hasKorean(q)) {
      const krMatches = searchKrStocks(q).map(s => ({ symbol: s.symbol, name: s.name, exchange: s.symbol.endsWith('.KQ') ? 'KOE' : 'KSC' }));
      const usMatches = searchUsStocksKr(q).map(s => ({ symbol: s.symbol, name: s.name, exchange: 'NMS' }));
      return res.json([...krMatches, ...usMatches]);
    }

    try {
      const data = await yfAuthed('https://query2.finance.yahoo.com/v1/finance/search', {
        q, quotesCount: 15, newsCount: 0,
      });
      const quotes = (data.quotes || [])
        .filter(x => x.quoteType === 'EQUITY' || x.quoteType === 'ETF')
        .map(x => ({ symbol: x.symbol, name: x.longname || x.shortname, exchange: x.exchange }));
      res.json(quotes);
    } catch (e) {
      if (e.response?.status === 400) return res.json([]);
      throw e;
    }
  } catch (err) {
    if (err.response?.status === 400) return res.json([]);
    console.error('search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 현재가
router.get('/quote/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    const result = await getChart(symbol, '5d', '1d');
    if (!result) return res.status(404).json({ error: '종목을 찾을 수 없습니다' });
    const meta = result.meta;

    const currentPrice = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose;
    const change = currentPrice - prevClose;

    let extra = {};
    let extraError = null;
    const cacheKey = `quoteSummary:${symbol}`;

    const extractExtra = (r) => {
      const sd = r.summaryDetail || {};
      const ks = r.defaultKeyStatistics || {};
      const price = r.price || {};
      return {
        marketCap: price.marketCap?.raw,
        trailingPE: sd.trailingPE?.raw,
        forwardPE: sd.forwardPE?.raw,
        dividendYield: sd.dividendYield?.raw,
        beta: sd.beta?.raw,
        epsTrailingTwelveMonths: ks.trailingEps?.raw,
        regularMarketOpen: price.regularMarketOpen?.raw,
      };
    };

    // 1순위: Finnhub 무료 API (미국 주식) - Yahoo 429 차단과 무관하게 안정적으로 동작
    try {
      const fh = await getFinnhubMetrics(symbol);
      if (fh) extra = fh;
    } catch (e) {
      console.log('Finnhub 실패:', e.message);
    }

    // 2순위: Yahoo quoteSummary (Finnhub 미지원 종목, 예: 한국 주식)
    if (!extra.beta && !extra.trailingPE) {
      try {
        let data = cacheGet(cacheKey);
        if (data === undefined) {
          data = await yfAuthed(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}`, {
            modules: 'summaryDetail,defaultKeyStatistics,price',
          });
          cacheSet(cacheKey, data, 4 * 60 * 60 * 1000);
        }
        extra = { ...extractExtra(data.quoteSummary?.result?.[0] || {}), ...extra };
      } catch (e) {
        console.log('quoteSummary 실패, 캐시된 값으로 대체 시도:', e.message);
        extraError = { message: e.message, status: e.response?.status, data: e.response?.data };
        // 새로 못 받아오면 만료됐더라도 마지막 성공값을 그대로 사용 (완전 공백보다 나음)
        const stale = cacheGetStale(cacheKey);
        if (stale) extra = { ...extractExtra(stale.quoteSummary?.result?.[0] || {}), ...extra };
      }
    }

    const ohlcv = result.indicators?.quote?.[0] || {};
    const lastIdx = (result.timestamp?.length || 1) - 1;

    res.json({
      symbol: meta.symbol,
      name: meta.longName || meta.shortName || symbol,
      currency: meta.currency,
      exchange: meta.fullExchangeName || meta.exchangeName,
      regularMarketPrice: currentPrice,
      regularMarketOpen: extra.regularMarketOpen ?? ohlcv.open?.[lastIdx],
      regularMarketDayHigh: meta.regularMarketDayHigh,
      regularMarketDayLow: meta.regularMarketDayLow,
      regularMarketPreviousClose: prevClose,
      regularMarketVolume: meta.regularMarketVolume,
      regularMarketChangePercent: (change / prevClose) * 100,
      regularMarketChange: change,
      marketCap: extra.marketCap,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      trailingPE: extra.trailingPE,
      forwardPE: extra.forwardPE,
      dividendYield: extra.dividendYield,
      beta: extra.beta,
      epsTrailingTwelveMonths: extra.epsTrailingTwelveMonths,
      ...(req.query.debug === '1' ? { extraError } : {}),
    });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ error: '존재하지 않거나 상장폐지된 종목입니다' });
    }
    console.error('quote error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 차트 데이터
router.get('/chart/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = '1y' } = req.query;
    const rangeMap = {
      '1d': '1d', '1m': '1mo', '3m': '3mo', '6m': '6mo', '1y': '1y', '3y': '3y', '5y': '5y',
    };
    const defaultInterval = period === '1d' ? '2m' : '1d';
    const result = await getChart(symbol, rangeMap[period] || '1y', req.query.interval || defaultInterval);
    if (!result) return res.status(404).json({ error: '차트 데이터 없음' });

    const timestamps = result.timestamp || [];
    const ohlcv = result.indicators?.quote?.[0] || {};
    const candles = timestamps.map((ts, i) => ({
      date: new Date(ts * 1000).toISOString(),
      open: ohlcv.open?.[i],
      high: ohlcv.high?.[i],
      low: ohlcv.low?.[i],
      close: ohlcv.close?.[i],
      volume: ohlcv.volume?.[i],
    })).filter(c => c.close != null);
    res.json(candles);
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ error: '존재하지 않거나 상장폐지된 종목입니다' });
    }
    console.error('chart error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Yahoo의 신형 fundamentals-timeseries API로 연간 재무제표 항목을 가져옴
// (구형 quoteSummary의 balanceSheetHistory/cashflowStatementHistory는 Yahoo가 값을 비워버림)
const TIMESERIES_TYPES = [
  'annualTotalRevenue', 'annualGrossProfit', 'annualOperatingIncome', 'annualNetIncome', 'annualEBITDA',
  'annualOperatingCashFlow', 'annualCapitalExpenditure', 'annualFreeCashFlow',
  'annualTotalAssets', 'annualTotalLiabilitiesNetMinorityInterest', 'annualStockholdersEquity', 'annualCashAndCashEquivalents',
];

async function getTimeseriesFinancials(symbol) {
  const data = await yfAuthed(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${symbol}`, {
    type: TIMESERIES_TYPES.join(','),
    period1: 0,
    period2: Math.floor(Date.now() / 1000),
  });

  const series = {};
  for (const r of data.timeseries?.result || []) {
    const type = r.meta?.type?.[0];
    if (!type || !r[type]) continue;
    series[type] = r[type].map(v => ({ date: v?.asOfDate, value: v?.reportedValue?.raw }));
  }

  const byDate = (type) => Object.fromEntries((series[type] || []).filter(v => v.date).map(v => [v.date, v.value]));
  const dates = [...new Set(Object.values(series).flat().map(v => v.date).filter(Boolean))].sort().reverse().slice(0, 4);

  const revenue = byDate('annualTotalRevenue');
  const gross = byDate('annualGrossProfit');
  const opInc = byDate('annualOperatingIncome');
  const net = byDate('annualNetIncome');
  const ebitda = byDate('annualEBITDA');
  const opCash = byDate('annualOperatingCashFlow');
  const capex = byDate('annualCapitalExpenditure');
  const fcf = byDate('annualFreeCashFlow');
  const assets = byDate('annualTotalAssets');
  const liab = byDate('annualTotalLiabilitiesNetMinorityInterest');
  const equity = byDate('annualStockholdersEquity');
  const cash = byDate('annualCashAndCashEquivalents');

  const income = dates.map(date => ({
    date, totalRevenue: revenue[date], grossProfit: gross[date], operatingIncome: opInc[date], netIncome: net[date], ebitda: ebitda[date],
  }));
  const balance = dates.map(date => ({
    date, totalAssets: assets[date], totalLiab: liab[date], totalStockholderEquity: equity[date], cash: cash[date],
  }));
  const cashflow = dates.map(date => ({
    date, operatingCashflow: opCash[date], capitalExpenditures: capex[date], freeCashflow: fcf[date],
  }));

  return { income, balance, cashflow };
}

// 한국 주식 전용: 네이버 증권 재무제표 API (Yahoo 429 차단과 무관하게 안정적으로 동작, .KS/.KQ 종목만 지원)
function parseNaverNum(v) {
  if (v == null || v === '-') return undefined;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? undefined : n;
}

async function getNaverKrFinancials(symbol) {
  const code = symbol.replace(/\.(KS|KQ)$/i, '');
  const res = await axios.get(`https://m.stock.naver.com/api/stock/${code}/finance/annual`, { timeout: 5000 });
  const info = res.data?.financeInfo;
  if (!info) return null;

  const actualKeys = (info.trTitleList || []).filter(t => t.isConsensus !== 'Y').map(t => t.key);
  const row = (title) => info.rowList.find(r => r.title === title)?.columns || {};

  const revenue = row('매출액');
  const opInc = row('영업이익');
  const net = row('당기순이익');
  const eps = row('EPS');
  const roe = row('ROE');
  const opMargin = row('영업이익률');
  const netMargin = row('순이익률');
  const debtRatio = row('부채비율');
  const quickRatio = row('당좌비율');
  const pbr = row('PBR');

  const UNIT = 1e8; // 억원 단위 -> 원 단위 변환 (Yahoo raw 값과 단위 통일)
  const income = actualKeys.map(key => ({
    date: `${key.slice(0, 4)}-${key.slice(4, 6)}-28`,
    totalRevenue: parseNaverNum(revenue[key]?.value) * UNIT,
    operatingIncome: parseNaverNum(opInc[key]?.value) * UNIT,
    netIncome: parseNaverNum(net[key]?.value) * UNIT,
  })).filter(v => !isNaN(v.totalRevenue));

  const latestKey = actualKeys[actualKeys.length - 1];
  const keyMetrics = {
    trailingEps: parseNaverNum(eps[latestKey]?.value),
    returnOnEquity: parseNaverNum(roe[latestKey]?.value) / 100,
    operatingMargins: parseNaverNum(opMargin[latestKey]?.value) / 100,
    profitMargins: parseNaverNum(netMargin[latestKey]?.value) / 100,
    debtToEquity: parseNaverNum(debtRatio[latestKey]?.value),
    quickRatio: parseNaverNum(quickRatio[latestKey]?.value),
    priceToBook: parseNaverNum(pbr[latestKey]?.value),
  };

  return { income: income.reverse(), keyMetrics };
}

// WiseReport(FnGuide, 네이버 증권이 재무제표 탭에 쓰는 실제 소스)에서 재무상태표/현금흐름표를 가져옴
// (네이버 증권 자체 API는 간이 요약만 제공하고 자산/부채/현금 절대값이 없어 별도 소스 필요)
const NAVER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function getWiseReportStatement(code, rpt) {
  const pageUrl = `https://navercomp.wisereport.co.kr/v2/company/c1030001.aspx?cmp_cd=${code}`;
  const pageRes = await axios.get(pageUrl, { headers: { 'User-Agent': NAVER_UA }, timeout: 5000 });
  const m = /encparam:\s*'([^']*)'/.exec(pageRes.data);
  if (!m) return null;
  const encparam = m[1];

  const dataRes = await axios.get('https://navercomp.wisereport.co.kr/v2/company/cF3002.aspx', {
    params: { cmp_cd: code, frq: 0, rpt, finGubun: 'MAIN', frqTyp: 0, cn: '', encparam },
    headers: { 'User-Agent': NAVER_UA, Referer: pageUrl },
    timeout: 5000,
  });
  return dataRes.data;
}

function wiseReportRow(data, name) {
  const row = (data?.DATA || []).find(r => r.ACC_NM?.replace(/^\.+/, '') === name);
  if (!row) return {};
  // YYMM은 연도 6개(마지막은 추정치) + YoY 2개 컬럼 -> DATA1..DATA5가 최근 5개 확정 연도
  const years = (data.YYMM || []).slice(0, 5).map(y => y.slice(0, 4));
  const result = {};
  years.forEach((year, i) => { result[year] = row[`DATA${i + 1}`]; });
  return result;
}

async function getKrBalanceCashflow(symbol) {
  const code = symbol.replace(/\.(KS|KQ)$/i, '');
  const UNIT = 1e8;
  const [balRes, cfRes] = await Promise.allSettled([
    getWiseReportStatement(code, 1),
    getWiseReportStatement(code, 2),
  ]);

  let balance = [], cashflow = [];
  if (balRes.status === 'fulfilled' && balRes.value) {
    const d = balRes.value;
    const assets = wiseReportRow(d, '자산총계');
    const liab = wiseReportRow(d, '부채총계');
    const equity = wiseReportRow(d, '자본총계');
    const cash = wiseReportRow(d, '현금및현금성자산');
    const years = Object.keys(assets).sort().reverse();
    balance = years.filter(y => assets[y] != null).map(year => ({
      date: `${year}-12-31`,
      totalAssets: assets[year] * UNIT,
      totalLiab: liab[year] * UNIT,
      totalStockholderEquity: equity[year] * UNIT,
      cash: cash[year] != null ? cash[year] * UNIT : undefined,
    }));
  }
  if (cfRes.status === 'fulfilled' && cfRes.value) {
    const d = cfRes.value;
    const opCash = wiseReportRow(d, '영업활동으로인한현금흐름');
    const capex = wiseReportRow(d, '유형자산의증가');
    const years = Object.keys(opCash).sort().reverse();
    cashflow = years.filter(y => opCash[y] != null).map(year => {
      const op = opCash[year] * UNIT;
      const capexVal = capex[year] != null ? -capex[year] * UNIT : undefined;
      return {
        date: `${year}-12-31`,
        operatingCashflow: op,
        capitalExpenditures: capexVal,
        freeCashflow: capexVal != null ? op + capexVal : undefined,
      };
    });
  }
  return { balance, cashflow };
}

// 재무제표
router.get('/financials/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const debug = req.query.debug === '1';

    const cacheKey = `financials:${symbol}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined && !debug) return res.json(cached);

    let income = [], balance = [], cashflow = [], keyMetrics = {}, analystTarget = {};
    const errors = {};

    // 두 Yahoo 호출을 병렬로 실행해 왕복 시간을 절반으로 줄임
    const [tsResult, qsResult] = await Promise.allSettled([
      getTimeseriesFinancials(symbol),
      yfAuthed(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}`, {
        modules: 'financialData,defaultKeyStatistics',
      }),
    ]);

    if (tsResult.status === 'fulfilled') {
      income = tsResult.value.income;
      balance = tsResult.value.balance;
      cashflow = tsResult.value.cashflow;
    } else {
      const e = tsResult.reason;
      console.log('timeseries 재무제표 오류:', e.message);
      errors.timeseries = { message: e.message, status: e.response?.status, data: e.response?.data };
    }

    if (qsResult.status === 'fulfilled') {
      const r = qsResult.value.quoteSummary?.result?.[0] || {};
      const fd = r.financialData || {};
      const ks = r.defaultKeyStatistics || {};

      keyMetrics = {
        priceToBook: ks.priceToBook?.raw,
        pegRatio: ks.pegRatio?.raw,
        trailingEps: ks.trailingEps?.raw,
        forwardEps: ks.forwardEps?.raw,
        returnOnEquity: fd.returnOnEquity?.raw,
        returnOnAssets: fd.returnOnAssets?.raw,
        profitMargins: fd.profitMargins?.raw,
        operatingMargins: fd.operatingMargins?.raw,
        grossMargins: fd.grossMargins?.raw,
        debtToEquity: fd.debtToEquity?.raw,
        currentRatio: fd.currentRatio?.raw,
        quickRatio: fd.quickRatio?.raw,
        revenueGrowth: fd.revenueGrowth?.raw,
        earningsGrowth: fd.earningsGrowth?.raw,
      };
      analystTarget = {
        targetMeanPrice: fd.targetMeanPrice?.raw,
        targetHighPrice: fd.targetHighPrice?.raw,
        targetLowPrice: fd.targetLowPrice?.raw,
        recommendationKey: fd.recommendationKey,
        numberOfAnalystOpinions: fd.numberOfAnalystOpinions?.raw,
      };
    } else {
      const e = qsResult.reason;
      console.log('재무제표 오류:', e.message);
      errors.quoteSummary = { message: e.message, status: e.response?.status, data: e.response?.data };
    }

    // 한국 주식은 Yahoo가 비어있으면 네이버 증권/WiseReport 데이터로 대체 (Yahoo 429 차단과 무관하게 동작)
    if (/\.(KS|KQ)$/i.test(symbol)) {
      if (income.length === 0 && Object.keys(keyMetrics).length === 0) {
        try {
          const naver = await getNaverKrFinancials(symbol);
          if (naver) {
            if (naver.income.length) income = naver.income;
            if (Object.keys(naver.keyMetrics).length) keyMetrics = naver.keyMetrics;
          }
        } catch (e) {
          console.log('네이버 재무제표 실패:', e.message);
          errors.naver = { message: e.message };
        }
      }
      if (balance.length === 0 && cashflow.length === 0) {
        try {
          const wise = await getKrBalanceCashflow(symbol);
          if (wise.balance.length) balance = wise.balance;
          if (wise.cashflow.length) cashflow = wise.cashflow;
        } catch (e) {
          console.log('WiseReport 재무상태표/현금흐름표 실패:', e.message);
          errors.wisereport = { message: e.message };
        }
      }
    }

    let payload = { income, balance, cashflow, keyMetrics, analystTarget };
    const hasData = income.length || balance.length || cashflow.length || Object.keys(keyMetrics).length;

    if (hasData) {
      // 데이터가 하나라도 있으면 캐시(1시간)
      cacheSet(cacheKey, payload, 60 * 60 * 1000);
    } else {
      // 전부 비어있으면(429 등) 만료됐더라도 마지막 성공값을 대신 사용 (완전 공백보다 나음)
      const stale = cacheGetStale(cacheKey);
      if (stale) payload = stale;
    }
    res.json({ ...payload, ...(debug ? { errors } : {}) });
  } catch (err) {
    console.error('financials error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
