import React, { useState, useEffect, useRef } from 'react';
import axios from './api';
import SearchBar from './components/SearchBar';
import StockOverview from './components/StockOverview';
import StockChart from './components/StockChart';
import FinancialStatements from './components/FinancialStatements';
import AIAnalysis from './components/AIAnalysis';
import MarketNews from './components/MarketNews';
import StockNews from './components/StockNews';
import Watchlist from './components/Watchlist';
import './App.css';

export default function App() {
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [quote, setQuote] = useState(null);
  const [financials, setFinancials] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSelectStock = async (symbol) => {
    setSelectedSymbol(symbol);
    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const [quoteRes, financialsRes, chartRes] = await Promise.all([
        axios.get(`/api/stock/quote/${symbol}`),
        axios.get(`/api/stock/financials/${symbol}`),
        axios.get(`/api/stock/chart/${symbol}?period=1y&interval=1d`),
      ]);
      setQuote(quoteRes.data);
      setFinancials(financialsRes.data);
      setChartData(chartRes.data);
    } catch (err) {
      setError('데이터를 불러오는 중 오류가 발생했습니다: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleChartPeriodChange = async (period) => {
    if (!selectedSymbol) return;
    try {
      const interval = period === '1d' ? '2m' : (period === '1m' || period === '3m') ? '1d' : '1wk';
      const res = await axios.get(`/api/stock/chart/${selectedSymbol}?period=${period}&interval=${interval}`);
      setChartData(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  // 30초마다 현재가를 자동 갱신 (실시간에 가까운 시세 업데이트)
  const selectedSymbolRef = useRef(selectedSymbol);
  selectedSymbolRef.current = selectedSymbol;

  useEffect(() => {
    if (!selectedSymbol) return;
    const timer = setInterval(async () => {
      try {
        const res = await axios.get(`/api/stock/quote/${selectedSymbolRef.current}`);
        setQuote(res.data);
      } catch {
        // 자동 갱신 실패는 조용히 무시 (기존 값 유지)
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [selectedSymbol]);

  const handleGoHome = () => {
    setSelectedSymbol(null);
    setQuote(null);
    setFinancials(null);
    setChartData([]);
    setAnalysis(null);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (!quote) return;
    setAnalysisLoading(true);
    try {
      const res = await axios.post('/api/analysis/ai', { quote, financials });
      setAnalysis(res.data);
    } catch (err) {
      setError('AI 분석 중 오류: ' + (err.response?.data?.error || err.message));
    } finally {
      setAnalysisLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <button className="logo" onClick={handleGoHome} title="홈으로">
            <span className="logo-icon">📈</span>
            <span className="logo-text">StockAI</span>
            <span className="logo-sub">주식 분석기</span>
          </button>
          <SearchBar onSelect={handleSelectStock} />
        </div>
      </header>

      <main className="app-main">
        {!selectedSymbol && (
          <div className="landing">
            <h1>AI 기반 주식 분석 플랫폼</h1>
            <p>주식 이름 또는 티커를 검색하여 재무제표, 차트, AI 분석을 확인하세요</p>
            <div className="example-stocks">
              <span>예시:</span>
              {['AAPL', 'TSLA', 'NVDA', '005930.KS', '035420.KS'].map(s => (
                <button key={s} className="example-btn" onClick={() => handleSelectStock(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {!selectedSymbol && <Watchlist onSelect={handleSelectStock} />}
        {!selectedSymbol && <MarketNews />}

        {loading && (
          <div className="loading-screen">
            <div className="spinner" />
            <p>데이터 불러오는 중...</p>
          </div>
        )}

        {error && (
          <div className="error-banner">{error}</div>
        )}

        {!loading && quote && (
          <div className="stock-content">
            <StockOverview quote={quote} />
            <StockChart data={chartData} symbol={quote.symbol} onPeriodChange={handleChartPeriodChange} />
            <StockNews symbol={quote.symbol} />
            <FinancialStatements financials={financials} currency={quote.currency} />
            <AIAnalysis
              analysis={analysis}
              loading={analysisLoading}
              onAnalyze={handleAnalyze}
              currency={quote.currency}
              currentPrice={quote.regularMarketPrice}
            />
          </div>
        )}
      </main>
    </div>
  );
}
