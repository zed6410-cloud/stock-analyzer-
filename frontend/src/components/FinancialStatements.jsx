import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import './FinancialStatements.css';

function fmt(n) {
  if (n == null) return 'N/A';
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  return n.toLocaleString();
}

function pct(n) {
  if (n == null) return 'N/A';
  return (n * 100).toFixed(1) + '%';
}

const TABS = ['손익계산서', '재무상태표', '현금흐름표', '핵심 지표'];

export default function FinancialStatements({ financials, currency }) {
  const [tab, setTab] = useState('손익계산서');
  if (!financials) return null;

  const incomeData = (financials.income || []).slice().reverse().map(d => ({
    year: new Date(d.date).getFullYear() + '년',
    매출: d.totalRevenue,
    영업이익: d.operatingIncome,
    순이익: d.netIncome,
  }));

  const cashData = (financials.cashflow || []).slice().reverse().map(d => ({
    year: new Date(d.date).getFullYear() + '년',
    영업현금흐름: d.operatingCashflow,
    잉여현금흐름: d.freeCashflow,
    설비투자: d.capitalExpenditures,
  }));

  const km = financials.keyMetrics || {};
  const at = financials.analystTarget || {};

  return (
    <div className="financials-card card">
      <h2 className="card-title">재무제표</h2>

      <div className="fin-tabs">
        {TABS.map(t => (
          <button key={t} className={`fin-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === '손익계산서' && (
        <div className="fin-section">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={incomeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3354" />
              <XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => fmt(v)} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: '#1e2340', border: '1px solid #3d4766', borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="매출" fill="#3b82f6" radius={[4,4,0,0]} />
              <Bar dataKey="영업이익" fill="#8b5cf6" radius={[4,4,0,0]} />
              <Bar dataKey="순이익" fill="#10b981" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
          <table className="fin-table">
            <thead>
              <tr><th>항목</th>{(financials.income || []).map(d => <th key={d.date}>{new Date(d.date).getFullYear()}년</th>)}</tr>
            </thead>
            <tbody>
              {[
                { label: '매출', key: 'totalRevenue' },
                { label: '매출총이익', key: 'grossProfit' },
                { label: '영업이익', key: 'operatingIncome' },
                { label: '순이익', key: 'netIncome' },
                { label: 'EBITDA', key: 'ebitda' },
              ].map(({ label, key }) => (
                <tr key={key}>
                  <td>{label}</td>
                  {(financials.income || []).map(d => <td key={d.date}>{fmt(d[key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === '재무상태표' && (
        <div className="fin-section">
          <table className="fin-table">
            <thead>
              <tr><th>항목</th>{(financials.balance || []).map(d => <th key={d.date}>{new Date(d.date).getFullYear()}년</th>)}</tr>
            </thead>
            <tbody>
              {[
                { label: '총자산', key: 'totalAssets' },
                { label: '총부채', key: 'totalLiab' },
                { label: '자기자본', key: 'totalStockholderEquity' },
                { label: '현금성 자산', key: 'cash' },
              ].map(({ label, key }) => (
                <tr key={key}>
                  <td>{label}</td>
                  {(financials.balance || []).map(d => <td key={d.date}>{fmt(d[key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === '현금흐름표' && (
        <div className="fin-section">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={cashData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3354" />
              <XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => fmt(v)} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: '#1e2340', border: '1px solid #3d4766', borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="영업현금흐름" fill="#3b82f6" radius={[4,4,0,0]} />
              <Bar dataKey="잉여현금흐름" fill="#10b981" radius={[4,4,0,0]} />
              <Bar dataKey="설비투자" fill="#f87171" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {tab === '핵심 지표' && (
        <div className="fin-section">
          <div className="key-metrics-grid">
            {[
              { label: 'ROE', value: pct(km.returnOnEquity) },
              { label: 'ROA', value: pct(km.returnOnAssets) },
              { label: '영업이익률', value: pct(km.operatingMargins) },
              { label: '순이익률', value: pct(km.profitMargins) },
              { label: '매출총이익률', value: pct(km.grossMargins) },
              { label: '부채비율', value: km.debtToEquity?.toFixed(1) ?? 'N/A' },
              { label: '유동비율', value: km.currentRatio?.toFixed(2) ?? 'N/A' },
              { label: '당좌비율', value: km.quickRatio?.toFixed(2) ?? 'N/A' },
              { label: '주가/장부가 (PBR)', value: km.priceToBook?.toFixed(2) ?? 'N/A' },
              { label: 'PEG 비율', value: km.pegRatio?.toFixed(2) ?? 'N/A' },
              { label: '매출 성장률', value: pct(km.revenueGrowth) },
              { label: '이익 성장률', value: pct(km.earningsGrowth) },
            ].map(({ label, value }) => (
              <div key={label} className="key-metric">
                <span className="km-label">{label}</span>
                <span className="km-value">{value}</span>
              </div>
            ))}
          </div>
          {at.recommendationKey && (
            <div className="analyst-box">
              <h3>애널리스트 컨센서스</h3>
              <div className="analyst-grid">
                <div className="analyst-item">
                  <span>투자의견</span>
                  <strong>{at.recommendationKey?.toUpperCase()}</strong>
                </div>
                <div className="analyst-item">
                  <span>목표주가 (평균)</span>
                  <strong>{at.targetMeanPrice?.toLocaleString()}</strong>
                </div>
                <div className="analyst-item">
                  <span>목표주가 (최고)</span>
                  <strong style={{color:'#34d399'}}>{at.targetHighPrice?.toLocaleString()}</strong>
                </div>
                <div className="analyst-item">
                  <span>목표주가 (최저)</span>
                  <strong style={{color:'#f87171'}}>{at.targetLowPrice?.toLocaleString()}</strong>
                </div>
                <div className="analyst-item">
                  <span>분석 인원</span>
                  <strong>{at.numberOfAnalystOpinions}명</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
