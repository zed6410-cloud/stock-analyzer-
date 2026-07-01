import express from 'express';
import axios from 'axios';
import { execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import path from 'path';

const router = express.Router();
const execFileAsync = promisify(execFile);
const CURL = 'C:\\Windows\\System32\\curl.exe';
const COOKIE_FILE = path.join(os.tmpdir(), 'yf_cookies.txt');

const YF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let _crumb = null;
let _crumbTime = 0;

async function ensureCrumb() {
  if (_crumb && Date.now() - _crumbTime < 25 * 60 * 1000) return _crumb;

  // 쿠키 수집
  await execFileAsync(CURL, [
    '-s', '-L',
    '-c', COOKIE_FILE, '-b', COOKIE_FILE,
    '-A', YF_UA,
    '-H', 'Accept: text/html',
    'https://finance.yahoo.com',
    '-o', process.platform === 'win32' ? 'NUL' : '/dev/null',
  ]).catch(() => {});

  // 크럼 요청
  const { stdout: crumb } = await execFileAsync(CURL, [
    '-s',
    '-b', COOKIE_FILE, '-c', COOKIE_FILE,
    '-A', YF_UA,
    'https://query2.finance.yahoo.com/v1/test/getcrumb',
  ]);

  _crumb = crumb.trim();
  _crumbTime = Date.now();
  console.log('YF crumb 획득:', _crumb.slice(0, 6) + '...');
  return _crumb;
}

async function yfCurl(url, params = {}) {
  const crumb = await ensureCrumb();
  const qs = new URLSearchParams({ ...params, crumb }).toString();
  const { stdout } = await execFileAsync(CURL, [
    '-s',
    '-b', COOKIE_FILE,
    '-A', YF_UA,
    '-H', 'Accept: application/json',
    `${url}?${qs}`,
  ]);
  return JSON.parse(stdout);
}

// Yahoo Finance v8 차트 (인증 불필요)
async function getChart(symbol, range = '1y', interval = '1d') {
  const res = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
    headers: { 'User-Agent': YF_UA },
    params: { interval, range, includePrePost: false },
  });
  return res.data.chart?.result?.[0];
}

// 종목 검색
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: '검색어를 입력하세요' });

    const data = await yfCurl('https://query2.finance.yahoo.com/v1/finance/search', {
      q, quotesCount: 10, newsCount: 0,
    });

    const quotes = (data.quotes || [])
      .filter(x => x.quoteType === 'EQUITY')
      .map(x => ({ symbol: x.symbol, name: x.longname || x.shortname, exchange: x.exchange }));
    res.json(quotes);
  } catch (err) {
    console.error('search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 현재가
router.get('/quote/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    // v8 차트에서 기본 데이터
    const result = await getChart(symbol, '5d', '1d');
    if (!result) return res.status(404).json({ error: '종목을 찾을 수 없습니다' });
    const meta = result.meta;

    const currentPrice = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose;
    const change = currentPrice - prevClose;

    // v7 quote에서 추가 데이터
    let extra = {};
    try {
      const data = await yfCurl('https://query2.finance.yahoo.com/v7/finance/quote', { symbols: symbol });
      const q = data.quoteResponse?.result?.[0] || {};
      extra = {
        marketCap: q.marketCap,
        trailingPE: q.trailingPE,
        forwardPE: q.forwardPE,
        dividendYield: q.dividendYield,
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
      const data = await yfCurl(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}`, {
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
