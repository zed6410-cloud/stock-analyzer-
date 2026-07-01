import express from 'express';
import axios from 'axios';
import { searchKrStocks } from '../data/krStocks.js';

const router = express.Router();

function hasKorean(text) {
  return /[가-힣]/.test(text);
}

const YF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let _crumb = null;
let _cookies = null;
let _crumbTime = 0;

// 순수 Node/axios 기반 인증 (curl 불필요, 모든 OS에서 동작)
async function ensureCrumb() {
  if (_crumb && Date.now() - _crumbTime < 25 * 60 * 1000) return { crumb: _crumb, cookies: _cookies };

  const r1 = await axios.get('https://fc.yahoo.com', {
    headers: { 'User-Agent': YF_UA },
    maxRedirects: 0,
    validateStatus: () => true,
  });
  _cookies = (r1.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

  const r2 = await axios.get('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': YF_UA, Cookie: _cookies },
  });
  _crumb = r2.data;
  _crumbTime = Date.now();
  console.log('YF crumb 획득:', String(_crumb).slice(0, 6) + '...');
  return { crumb: _crumb, cookies: _cookies };
}

async function yfAuthed(url, params = {}) {
  const { crumb, cookies } = await ensureCrumb();
  const res = await axios.get(url, {
    params: { ...params, crumb },
    headers: { 'User-Agent': YF_UA, Cookie: cookies },
  });
  return res.data;
}

// Yahoo Finance v8 차트 (인증 불필요)
async function getChart(symbol, range = '1y', interval = '1d') {
  const res = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
    headers: { 'User-Agent': YF_UA },
    params: { interval, range, includePrePost: false },
  });
  return res.data.chart?.result?.[0];
}

// 종목 검색 (나스닥/코스닥/코스피 등 전세계 상장 종목 대상)
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: '검색어를 입력하세요' });

    // 한글 검색어는 Yahoo가 거부하므로 로컬 매핑 테이블에서 먼저 찾음
    if (hasKorean(q)) {
      const local = searchKrStocks(q).map(s => ({ symbol: s.symbol, name: s.name, exchange: s.symbol.endsWith('.KQ') ? 'KOE' : 'KSC' }));
      return res.json(local);
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
      const data = await yfAuthed('https://query2.finance.yahoo.com/v7/finance/quote', { symbols: symbol });
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
    const { period = '1y', interval = '1d' } = req.query;
    const rangeMap = {
      '1m': '1mo', '3m': '3mo', '6m': '6mo', '1y': '1y', '3y': '3y', '5y': '5y',
    };
    const result = await getChart(symbol, rangeMap[period] || '1y', interval);
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

// 재무제표
router.get('/financials/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    let income = [], balance = [], cashflow = [], keyMetrics = {}, analystTarget = {};

    try {
      const data = await yfAuthed(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}`, {
        modules: 'incomeStatementHistory,balanceSheetHistory,cashflowStatementHistory,financialData,defaultKeyStatistics',
      });
      const r = data.quoteSummary?.result?.[0] || {};
      const fd = r.financialData || {};
      const ks = r.defaultKeyStatistics || {};

      income = (r.incomeStatementHistory?.incomeStatementHistory || []).map(s => ({
        date: s.endDate?.fmt,
        totalRevenue: s.totalRevenue?.raw,
        grossProfit: s.grossProfit?.raw,
        operatingIncome: s.operatingIncome?.raw,
        netIncome: s.netIncome?.raw,
        ebitda: s.ebitda?.raw,
      }));
      balance = (r.balanceSheetHistory?.balanceSheetStatements || []).map(s => ({
        date: s.endDate?.fmt,
        totalAssets: s.totalAssets?.raw,
        totalLiab: s.totalLiab?.raw,
        totalStockholderEquity: s.totalStockholderEquity?.raw,
        cash: s.cash?.raw,
      }));
      cashflow = (r.cashflowStatementHistory?.cashflowStatements || []).map(s => ({
        date: s.endDate?.fmt,
        operatingCashflow: s.totalCashFromOperatingActivities?.raw,
        capitalExpenditures: s.capitalExpenditures?.raw,
        freeCashflow: s.freeCashFlow?.raw,
      }));
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
    }

    res.json({ income, balance, cashflow, keyMetrics, analystTarget });
  } catch (err) {
    console.error('financials error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
