import React, { useState } from 'react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import './StockChart.css';

const PERIODS = ['1d', '1m', '3m', '6m', '1y', '3y', '5y'];

const CustomTooltip = ({ active, payload, label, isIntraday }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const dateLabel = isIntraday
    ? new Date(d.date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : new Date(d.date).toLocaleDateString('ko-KR');
  return (
    <div className="chart-tooltip">
      <div className="tt-date">{dateLabel}</div>
      <div className="tt-row"><span>종가</span><span>{d.close?.toLocaleString()}</span></div>
      <div className="tt-row"><span>시가</span><span>{d.open?.toLocaleString()}</span></div>
      <div className="tt-row"><span>고가</span><span style={{color:'#34d399'}}>{d.high?.toLocaleString()}</span></div>
      <div className="tt-row"><span>저가</span><span style={{color:'#f87171'}}>{d.low?.toLocaleString()}</span></div>
      <div className="tt-row"><span>거래량</span><span>{d.volume?.toLocaleString()}</span></div>
    </div>
  );
};

export default function StockChart({ data, symbol, onPeriodChange }) {
  const [period, setPeriod] = useState('1y');

  const handlePeriod = (p) => {
    setPeriod(p);
    onPeriodChange(p);
  };

  const isIntraday = period === '1d';
  const formatted = data.map(d => ({
    ...d,
    dateStr: isIntraday
      ? new Date(d.date).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      : new Date(d.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }),
  }));

  const firstClose = formatted[0]?.close || 1;
  const lastClose = formatted[formatted.length - 1]?.close || 1;
  const isPositive = lastClose >= firstClose;

  return (
    <div className="chart-card card">
      <div className="chart-header">
        <h2 className="card-title">가격 차트</h2>
        <div className="period-tabs">
          {PERIODS.map(p => (
            <button
              key={p}
              className={`period-btn${period === p ? ' active' : ''}`}
              onClick={() => handlePeriod(p)}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={formatted} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3354" />
            <XAxis
              dataKey="dateStr"
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              interval={Math.floor(formatted.length / 8)}
            />
            <YAxis
              yAxisId="price"
              orientation="right"
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              tickFormatter={v => v.toLocaleString()}
            />
            <YAxis
              yAxisId="volume"
              orientation="left"
              tick={{ fill: '#64748b', fontSize: 10 }}
              tickLine={false}
              tickFormatter={v => (v / 1e6).toFixed(0) + 'M'}
              width={50}
            />
            <Tooltip content={<CustomTooltip isIntraday={isIntraday} />} />
            <Bar yAxisId="volume" dataKey="volume" fill="#2d3a6b" opacity={0.5} name="거래량" />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="close"
              stroke={isPositive ? '#34d399' : '#f87171'}
              strokeWidth={2}
              dot={false}
              name="종가"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
