import React from 'react';
import './LegalPage.css';

export default function PrivacyPolicy({ onBack }) {
  return (
    <div className="legal-page card">
      <button className="legal-back" onClick={onBack}>← 홈으로</button>
      <h1>개인정보 처리방침</h1>
      <p className="legal-updated">최종 수정일: 2026년 7월</p>

      <h2>1. 수집하는 정보</h2>
      <p>
        StockAI(이하 "본 사이트")는 회원가입 및 로그인 기능을 운영하지 않으며,
        이름·이메일·전화번호 등 개인 식별정보를 수집하지 않습니다.
      </p>
      <p>
        "관심종목(즐겨찾기)" 기능은 사용자의 브라우저 로컬 저장소(localStorage)에만 저장되며,
        서버로 전송되거나 저장되지 않습니다.
      </p>

      <h2>2. 쿠키 및 광고</h2>
      <p>
        본 사이트는 Google AdSense를 통해 광고를 게재할 수 있습니다. Google을 포함한 광고 파트너는
        사용자의 이전 방문 기록을 바탕으로 맞춤 광고를 제공하기 위해 쿠키를 사용할 수 있습니다.
        사용자는{' '}
        <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">
          Google 광고 설정
        </a>
        에서 맞춤 광고를 비활성화할 수 있습니다.
      </p>

      <h2>3. 외부 데이터 제공처</h2>
      <p>
        본 사이트는 주식 시세·재무 정보·뉴스 제공을 위해 Yahoo Finance, 네이버 증권, Finnhub 등
        제3자 공개 데이터를 활용하며, AI 분석에는 Groq API가 사용됩니다. 이 과정에서 사용자의
        개인정보가 해당 서비스로 전송되지 않습니다.
      </p>

      <h2>4. 투자 유의사항</h2>
      <p>
        본 사이트가 제공하는 목표주가, AI 분석, 재무 지표 등은 투자 참고용 정보이며 투자 자문이나
        매매 권유가 아닙니다. 모든 투자 판단과 그 결과에 대한 책임은 이용자 본인에게 있습니다.
      </p>

      <h2>5. 문의</h2>
      <p>본 방침에 대한 문의는 사이트 운영자에게 연락해주시기 바랍니다.</p>
    </div>
  );
}
