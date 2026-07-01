import React from 'react';
import ReactMarkdown from 'react-markdown';
import './AIAnalysis.css';

const GRADE_COLOR = {
  '매수': '#34d399', '강력매수': '#10b981',
  '중립': '#fbbf24',
  '매도': '#f87171', '강력매도': '#ef4444',
};

export default function AIAnalysis({ analysis, loading, onAnalyze, currency, currentPrice }) {
  const rb = analysis?.ruleBasedAnalysis;

  return (
    <div className="ai-card card">
      <div className="ai-header">
        <h2 className="card-title">🤖 AI 투자 분석</h2>
        <button
          className="analyze-btn"
          onClick={onAnalyze}
          disabled={loading}
        >
          {loading ? '분석 중...' : analysis ? '재분석' : 'AI 분석 시작'}
        </button>
      </div>

      {loading && (
        <div className="ai-loading">
          <div className="spinner" />
          <span>Claude AI가 재무 데이터를 분석하고 있습니다...</span>
        </div>
      )}

      {!loading && !analysis && (
        <div className="ai-empty">
          <div className="ai-empty-icon">📊</div>
          <p>"AI 분석 시작" 버튼을 클릭하면 Claude AI가 재무 데이터를 기반으로<br />목표주가, 하향 리스크, 투자의견을 제시합니다.</p>
        </div>
      )}

      {!loading && analysis && (
        <div className="ai-results">
          {/* 규칙 기반 요약 */}
          {rb && (
            <div className="rb-summary">
              <div className="rb-grid">
                <div className="rb-item">
                  <span className="rb-label">현재가</span>
                  <span className="rb-value">{rb.currentPrice?.toLocaleString()} {currency}</span>
                </div>
                <div className="rb-item">
                  <span className="rb-label">평균 목표가</span>
                  <span className="rb-value target">{rb.avgTarget ? Number(rb.avgTarget).toLocaleString() : 'N/A'} {currency}</span>
                  {rb.upside && <span className={`rb-upside ${parseFloat(rb.upside) >= 0 ? 'up' : 'down'}`}>{rb.upside > 0 ? '+' : ''}{rb.upside}%</span>}
                </div>
                <div className="rb-item">
                  <span className="rb-label">지지선 (52주 저점)</span>
                  <span className="rb-value" style={{color:'#f87171'}}>{rb.support ? Number(rb.support).toLocaleString() : 'N/A'} {currency}</span>
                  {rb.downside && <span className="rb-upside down">{rb.downside}%</span>}
                </div>
                <div className="rb-item">
                  <span className="rb-label">저항선 (52주 고점)</span>
                  <span className="rb-value" style={{color:'#34d399'}}>{rb.resistance ? Number(rb.resistance).toLocaleString() : 'N/A'} {currency}</span>
                </div>
                <div className="rb-item">
                  <span className="rb-label">규칙기반 의견</span>
                  <span className="rb-value" style={{color: GRADE_COLOR[rb.recommendation] || '#e2e8f0', fontWeight: 700}}>{rb.recommendation}</span>
                </div>
              </div>

              <div className="rb-targets-detail">
                <h4>목표가 산출 근거</h4>
                <div className="targets-list">
                  {rb.targets?.map((t, i) => (
                    <div key={i} className="target-item">
                      <div className="target-method">{t.method}</div>
                      <div className="target-price">{Number(t.target).toLocaleString()} {currency}</div>
                      <div className="target-basis">{t.basis}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Claude AI 분석 */}
          {analysis.aiAnalysis && (
            <div className="ai-text-section">
              <h3>{analysis.provider || 'AI'} 종합 분석</h3>
              <div className="ai-markdown">
                <ReactMarkdown>{analysis.aiAnalysis}</ReactMarkdown>
              </div>
            </div>
          )}

          {analysis.aiError && (
            <div className="ai-error-note">
              <strong>ℹ️ AI 분석 비활성화:</strong> {analysis.aiError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
