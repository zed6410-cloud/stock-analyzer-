import React, { useState, useMemo } from 'react';
import './TaxCalculator.css';

const EXEMPTION = 2_500_000; // 해외주식 양도소득 기본공제 (연 250만원)
const TAX_RATE = 0.22; // 지방소득세 포함 22%

function toNumber(v) {
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export default function TaxCalculator({ onBack }) {
  const [buyAmount, setBuyAmount] = useState('');
  const [sellAmount, setSellAmount] = useState('');
  const [otherGain, setOtherGain] = useState('');
  const [otherLoss, setOtherLoss] = useState('');

  const result = useMemo(() => {
    const buy = toNumber(buyAmount);
    const sell = toNumber(sellAmount);
    const gainOther = toNumber(otherGain);
    const lossOther = toNumber(otherLoss);

    const thisGain = sell - buy;
    const netGain = thisGain + gainOther - lossOther; // 손익통산
    const taxableBase = Math.max(netGain - EXEMPTION, 0);
    const tax = Math.round(taxableBase * TAX_RATE);

    return { thisGain, netGain, taxableBase, tax };
  }, [buyAmount, sellAmount, otherGain, otherLoss]);

  const handleNumInput = (setter) => (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setter(raw ? Number(raw).toLocaleString() : '');
  };

  return (
    <div className="taxcalc-page card">
      <button className="legal-back" onClick={onBack}>← 홈으로</button>
      <h1>해외주식 양도소득세 계산기</h1>
      <p className="taxcalc-sub">
        해외(미국 등) 주식 매매차익에 대한 양도소득세를 간단히 추정합니다.
        기본공제 연 250만원, 세율 22%(지방소득세 포함)를 적용한 국내 세법 기준 계산이며,
        실제 신고 시 매입·매도 수수료, 환율 적용 시점 등에 따라 금액이 달라질 수 있습니다.
      </p>

      <div className="taxcalc-form">
        <label>
          <span>이번 매도 매수금액 (원화 환산, 수수료 포함)</span>
          <input type="text" inputMode="numeric" placeholder="예: 10,000,000" value={buyAmount} onChange={handleNumInput(setBuyAmount)} />
        </label>
        <label>
          <span>이번 매도 매도금액 (원화 환산, 수수료 차감 후)</span>
          <input type="text" inputMode="numeric" placeholder="예: 13,000,000" value={sellAmount} onChange={handleNumInput(setSellAmount)} />
        </label>
        <label>
          <span>올해 다른 해외주식 매매 이익 합계 (있다면)</span>
          <input type="text" inputMode="numeric" placeholder="0" value={otherGain} onChange={handleNumInput(setOtherGain)} />
        </label>
        <label>
          <span>올해 다른 해외주식 매매 손실 합계 (있다면)</span>
          <input type="text" inputMode="numeric" placeholder="0" value={otherLoss} onChange={handleNumInput(setOtherLoss)} />
        </label>
      </div>

      <div className="taxcalc-result">
        <div className="taxcalc-row">
          <span>이번 매매 차익</span>
          <strong className={result.thisGain >= 0 ? 'gain-pos' : 'gain-neg'}>{result.thisGain.toLocaleString()} 원</strong>
        </div>
        <div className="taxcalc-row">
          <span>연간 순양도소득 (손익통산 후)</span>
          <strong>{result.netGain.toLocaleString()} 원</strong>
        </div>
        <div className="taxcalc-row">
          <span>기본공제 (연 250만원)</span>
          <strong>- {EXEMPTION.toLocaleString()} 원</strong>
        </div>
        <div className="taxcalc-row highlight">
          <span>과세표준</span>
          <strong>{result.taxableBase.toLocaleString()} 원</strong>
        </div>
        <div className="taxcalc-row highlight">
          <span>예상 양도소득세 (22%)</span>
          <strong className="tax-final">{result.tax.toLocaleString()} 원</strong>
        </div>
      </div>

      <p className="taxcalc-note">
        ※ 본 계산은 참고용이며 세무 신고를 대신하지 않습니다. 정확한 신고는 국세청 홈택스 또는 세무 전문가와 상담하세요.
        해외주식 양도소득은 다음 해 5월 종합소득세 신고 기간에 별도로 신고·납부해야 합니다.
      </p>
    </div>
  );
}
