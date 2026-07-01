import React from 'react';
import './StockOverview.css';

function fmt(n, currency) {
  if (n == null) return 'N/A';
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  return n.toLocaleString();
}

function Metric({ label, value, highlight }) {
  return (
    <div className={`metric${highlight ? ' highlight' : ''}`}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value ?? 'N/A'}</span>
    </div>
  );
}

export default function StockOverview({ quote }) {
  const isUp = quote.regularMarketChange >= 0;
  const changeColor = isUp ? '#34d399' : '#f87171';
  const changeSign = isUp ? '+' : '';

  return (
    <div className="overview-card card">
      <div className="overview-top">
        <div className="overview-name">
          <h1 className="stock-name">{quote.name}</h1>
          <div className="stock-meta">
            <span className="stock-symbol">{quote.symbol}</span>
            <span className="stock-exchange">{quote.exchange}</span>
          </div>
        </div>
        <div className="overview-price">
          <div className="current-price">
            {quote.regularMarketPrice?.toLocaleString()} <span className="currency">{quote.currency}</span>
          </div>
          <div className="price-change" style={{ color: changeColor }}>
            {changeSign}{quote.regularMarketChange?.toFixed(2)} ({changeSign}{quote.regularMarketChangePercent?.toFixed(2)}%)
          </div>
        </div>
      </div>

      <div className="metrics-grid">
        <Metric label="시가" value={quote.regularMarketOpen?.toLocaleString()} />
        <Metric label="고가" value={quote.regularMarketDayHigh?.toLocaleString()} />
        <Metric label="저가" value={quote.regularMarketDayLow?.toLocaleString()} />
        <Metric label="전일 종가" value={quote.regularMarketPreviousClose?.toLocaleString()} />
        <Metric label="거래량" value={fmt(quote.regularMarketVolume)} />
        <Metric label="시가총액" value={fmt(quote.marketCap)} />
        <Metric label="52주 최고" value={quote.fiftyTwoWeekHigh?.toLocaleString()} />
        <Metric label="52주 최저" value={quote.fiftyTwoWeekLow?.toLocaleString()} />
        <Metric label="PER (후행)" value={quote.trailingPE?.toFixed(2)} />
        <Metric label="PER (선행)" value={quote.forwardPE?.toFixed(2)} />
        <Metric label="EPS" value={quote.epsTrailingTwelveMonths?.toFixed(2)} />
        <Metric label="배당수익률" value={quote.dividendYield ? (quote.dividendYield * 100).toFixed(2) + '%' : 'N/A'} />
        <Metric label="베타" value={quote.beta?.toFixed(2)} />
      </div>
    </div>
  );
}
