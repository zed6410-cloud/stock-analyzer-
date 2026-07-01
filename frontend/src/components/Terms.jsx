import React from 'react';
import './LegalPage.css';

export default function Terms({ onBack }) {
  return (
    <div className="legal-page card">
      <button className="legal-back" onClick={onBack}>← 홈으로</button>
      <h1>이용약관 및 면책조항</h1>
      <p className="legal-updated">최종 수정일: 2026년 7월</p>

      <h2>1. 서비스 소개</h2>
      <p>
        StockAI(이하 "본 사이트")는 국내외 주식의 시세, 재무제표, 뉴스, AI 기반 참고 분석 정보를
        무료로 제공하는 정보성 사이트입니다.
      </p>

      <h2>2. 정보의 정확성</h2>
      <p>
        본 사이트가 제공하는 모든 데이터는 Yahoo Finance, 네이버 증권 등 제3자 API를 통해 실시간
        또는 지연 시세로 제공되며, 오류·지연·누락이 있을 수 있습니다. 본 사이트는 정보의 정확성,
        완전성, 적시성을 보장하지 않습니다.
      </p>

      <h2>3. 투자 책임</h2>
      <p>
        본 사이트의 AI 분석, 목표주가, 투자의견은 참고 자료일 뿐이며 투자 자문이 아닙니다.
        이를 근거로 한 투자 결정 및 그 결과에 대해 본 사이트는 어떠한 책임도 지지 않습니다.
      </p>

      <h2>4. 서비스 변경 및 중단</h2>
      <p>
        본 사이트는 사전 고지 없이 서비스의 내용을 변경하거나 중단할 수 있습니다.
      </p>
    </div>
  );
}
