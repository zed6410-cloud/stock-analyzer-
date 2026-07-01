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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 429(요청 과다) 응답 시 짧게 대기 후 1회 재시도
async function withRetry429(fn, retries = 2, delayMs = 800) {
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

// 종목 검색 (나스닥/코스닥/코스피 등 전세계 상장 종목 대상)
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: '검색어를 입력하세요' });

    // 한글 검색어는 Yahoo가 거부하므로: 1) 네이버 증권 실시간 검색(전세계 종목 커버) 2) 실패 시 로컬 목록으로 대체
    if (hasKorean(q)) {
      try {
        const cacheKey = `naversearch:${q}`;
        let naverResults = cacheGet(cacheKey);
        if (naverResults === undefined) {
          naverResults = await searchNaver(q);
          cacheSet(cacheKey, naverResults, 10 * 60 * 1000);
        }
        if (naverResults.length > 0) return res.json(naverResults.slice(0, 15));
      } catch (e) {
        console.log('네이버 검색 실패, 로컬 목록으로 대체:', e.message);
      }

      const krMatches = searchKrStocks(q).map(s => ({ symbol: s.symbol, name: s.name, exchange: s.symbol.endsWith('.KQ') ? 'KOE' : 'KSC' }));
      const usMatches = searchUsStocksKr(q).map(s => ({ symbol: s.symbol, name: s.name, exchange: 'NMS' }));
      return res.json([...krMatches, ...usMatches]);
    }

    const data = await yfAuthed('https://query2.finance.yahoo.com/v1/finance/search', {
      q, quotesCount: 15, newsCount: 0,
    });

    const quotes = (data.quotes || [])
      .filter(x => x.quoteType === 'EQUITY' || x.quoteType === 'ETF')
      .map(x => ({ symbol: x.symbol, name: x.longname || x.shortname, exchange: x.exchange }));
    res.json(quotes);
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
    try {
      const cacheKey = `v7quote:${symbol}`;
      let data = cacheGet(cacheKey);
      if (data === undefined) {
        data = await yfAuthed('https://query2.finance.yahoo.com/v7/finance/quote', { symbols: symbol });
        cacheSet(cacheKey, data, 30 * 1000);
      }
      const q = data.quoteResponse?.result?.[0] || {};
      extra = {
        marketCap: q.marketCap,
        trailingPE: q.trailingPE,
        forwardPE: q.forwardPE,
        dividendYield: q.dividendYield ? q.dividendYield / 100 : undefined,
        beta: q.beta,
        epsTrailingTwelveMonths: q.epsTrailingTwelveMonths,
        regularMarketOpen: q.regularMarketOpen,
      };
    } catch (e) {
      console.log('v7 quote 실패:', e.message);
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

    try {
      const ts = await getTimeseriesFinancials(symbol);
      income = ts.income;
      balance = ts.balance;
      cashflow = ts.cashflow;
    } catch (e) {
      console.log('timeseries 재무제표 오류:', e.message);
      errors.timeseries = { message: e.message, status: e.response?.status, data: e.response?.data };
    }

    try {
      const data = await yfAuthed(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}`, {
        modules: 'financialData,defaultKeyStatistics',
      });
      const r = data.quoteSummary?.result?.[0] || {};
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
    } catch (e) {
      console.log('재무제표 오류:', e.message);
      errors.quoteSummary = { message: e.message, status: e.response?.status, data: e.response?.data };
    }

    const payload = { income, balance, cashflow, keyMetrics, analystTarget };
    // 데이터가 하나라도 있으면 캐시(1시간) - 전부 비어있으면(429 등) 캐시하지 않고 다음 요청에서 재시도되게 함
    if (income.length || balance.length || cashflow.length || Object.keys(keyMetrics).length) {
      cacheSet(cacheKey, payload, 60 * 60 * 1000);
    }
    res.json({ ...payload, ...(debug ? { errors } : {}) });
  } catch (err) {
    console.error('financials error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
