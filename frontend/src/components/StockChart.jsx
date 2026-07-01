import React, { useState } from 'react';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import './StockChart.css';

const PERIODS = ['1d', '1m', '3m', '6m', '1y', '3y', '5y'];

const CustomTooltip = ({ active, payload, isIntraday }) => {
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

// 캔들스틱(막대) 렌더러: 고가-저가 심지 + 시가-종가 몸통
const Candle = (props) => {
  const { x, y, width, height, payload } = props;
  const { open, close, high, low } = payload;
  if (open == null || close == null || high == null || low == null || high === low) return null;

  const isUp = close >= open;
  const color = isUp ? '#34d399' : '#f87171';
  const range = high - low;
  const valueToY = (v) => y + height * (high - v) / range;

  const openY = valueToY(open);
  const closeY = valueToY(close);
  const bodyTop = Math.min(openY, closeY);
  const bodyHeight = Math.max(Math.abs(closeY - openY), 1);
  const wickX = x + width / 2;
  const bodyWidth = Math.max(width * 0.6, 1);
  const bodyX = x + (width - bodyWidth) / 2;

  return (
    <g>
      <line x1={wickX} x2={wickX} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={bodyX} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} />
    </g>
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
              domain={['auto', 'auto']}
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
            <Bar
              yAxisId="price"
              dataKey={(d) => [d.low, d.high]}
              shape={Candle}
              name="가격"
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
