import express from 'express';
import axios from 'axios';

const router = express.Router();

// Gemini 무료 API 호출
async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await axios.post(url, {
    contents: [{ parts: [{ text: prompt }] }],
  }, { headers: { 'Content-Type': 'application/json' } });
  const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 응답이 비어있습니다');
  return text;
}

// Groq 무료 API 호출 (OpenAI 호환)
async function callGroq(prompt) {
  const key = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1500,
  }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` } });
  const text = res.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq 응답이 비어있습니다');
  return text;
}

// OpenRouter 무료 모델 호출 (OpenAI 호환) - Groq 실패 시 대체용
async function callOpenRouter(prompt) {
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free';
  const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1500,
  }, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` } });
  const text = res.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter 응답이 비어있습니다');
  return text;
}

function calcRuleBasedTargets(quote, financials) {
  const price = quote.regularMarketPrice;
  const eps = quote.epsTrailingTwelveMonths;
  const high52 = quote.fiftyTwoWeekHigh;
  const low52 = quote.fiftyTwoWeekLow;
  const analystTarget = financials?.analystTarget?.targetMeanPrice;
  const analystHigh = financials?.analystTarget?.targetHighPrice;
  const analystLow = financials?.analystTarget?.targetLowPrice;
  const growthRate = financials?.keyMetrics?.earningsGrowth;

  const targets = [];

  targets.push({
    method: '52주 중간가',
    target: ((high52 + low52) / 2).toFixed(0),
    basis: '52주 고점과 저점의 평균',
  });

  if (eps && eps > 0) {
    targets.push({
      method: 'PER 기반 (섹터평균 20x)',
      target: (eps * 20).toFixed(0),
      basis: `EPS ${eps.toFixed(2)} × PER 20배`,
    });
  }

  if (eps && eps > 0 && growthRate) {
    targets.push({
      method: '성장률 반영 PEG',
      target: (eps * (1 + growthRate) * 15).toFixed(0),
      basis: `EPS × (1 + 성장률 ${(growthRate * 100).toFixed(1)}%) × 15x`,
    });
  }

  if (analystTarget) {
    targets.push({
      method: '애널리스트 컨센서스',
      target: analystTarget.toFixed(0),
      high: analystHigh?.toFixed(0),
      low: analystLow?.toFixed(0),
      basis: `${financials?.analystTarget?.numberOfAnalystOpinions || '?'}명 애널리스트 평균`,
    });
  }

  const targetPrices = targets.map(t => parseFloat(t.target)).filter(v => !isNaN(v) && v > 0);
  const avgTarget = targetPrices.length > 0
    ? (targetPrices.reduce((a, b) => a + b, 0) / targetPrices.length).toFixed(0)
    : null;

  const upside = avgTarget ? (((avgTarget - price) / price) * 100).toFixed(1) : null;
  const downside = low52 ? (((low52 - price) / price) * 100).toFixed(1) : null;

  return {
    currentPrice: price,
    avgTarget,
    upside,
    downside,
    support: low52?.toFixed(0),
    resistance: high52?.toFixed(0),
    targets,
    recommendation: upside > 15 ? '매수' : upside < -10 ? '매도' : '중립',
  };
}

router.post('/ai', async (req, res) => {
  try {
    const { quote, financials } = req.body;
    if (!quote) return res.status(400).json({ error: '주식 데이터가 필요합니다' });

    const ruleBasedResult = calcRuleBasedTargets(quote, financials);

    const hasGroq = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'your_groq_api_key_here';
    const hasOpenRouter = process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'your_openrouter_api_key_here';
    const hasGemini = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here';
    const hasClaude = process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_claude_api_key_here';

    if (!hasGroq && !hasOpenRouter && !hasGemini && !hasClaude) {
      return res.json({
        ruleBasedAnalysis: ruleBasedResult,
        aiAnalysis: null,
        aiError: 'AI 키가 설정되지 않았습니다. backend/.env 파일에 GROQ_API_KEY(무료) 를 설정하면 AI 종합 분석이 활성화됩니다.',
      });
    }

    const prompt = `당신은 전문 주식 분석가입니다. 다음 데이터를 분석하고 투자 의견을 제시해주세요.

종목: ${quote.name} (${quote.symbol}) / 현재가: ${quote.regularMarketPrice} ${quote.currency}
시가총액: ${quote.marketCap ? (quote.marketCap / 1e9).toFixed(2) + 'B' : 'N/A'}
52주 고가/저가: ${quote.fiftyTwoWeekHigh} / ${quote.fiftyTwoWeekLow}
PER(후행/선행): ${quote.trailingPE?.toFixed(2)} / ${quote.forwardPE?.toFixed(2)}
EPS: ${quote.epsTrailingTwelveMonths?.toFixed(2)}
ROE: ${financials?.keyMetrics?.returnOnEquity ? (financials.keyMetrics.returnOnEquity * 100).toFixed(1) + '%' : 'N/A'}
영업이익률: ${financials?.keyMetrics?.operatingMargins ? (financials.keyMetrics.operatingMargins * 100).toFixed(1) + '%' : 'N/A'}
매출성장률: ${financials?.keyMetrics?.revenueGrowth ? (financials.keyMetrics.revenueGrowth * 100).toFixed(1) + '%' : 'N/A'}
부채비율: ${financials?.keyMetrics?.debtToEquity?.toFixed(1) || 'N/A'}
규칙기반 평균 목표가: ${ruleBasedResult.avgTarget} (${ruleBasedResult.upside}% 상승여력)

다음 형식으로 분석해주세요:

**📊 종합 투자 의견**: [강력매수/매수/중립/매도/강력매도]

**🎯 목표주가**: [가격] ${quote.currency} (현재 대비 [%])
**⚠️ 하향 리스크**: [가격] ${quote.currency} (현재 대비 [%])

**✅ 투자 포인트 (3가지)**:
1.
2.
3.

**❌ 리스크 요인 (3가지)**:
1.
2.
3.

**📈 단기 전망 (3개월)**:
**📅 중기 전망 (1년)**:

**💡 투자 전략**:`;

    let aiAnalysis, provider;
    if (hasGroq) {
      try {
        aiAnalysis = await callGroq(prompt);
        provider = 'Groq (Llama 3.3)';
      } catch (e) {
        console.log('Groq 실패, 대체 provider 시도:', e.message);
        if (hasOpenRouter) {
          aiAnalysis = await callOpenRouter(prompt);
          provider = 'OpenRouter (GPT-OSS)';
        } else {
          throw e;
        }
      }
    } else if (hasOpenRouter) {
      aiAnalysis = await callOpenRouter(prompt);
      provider = 'OpenRouter (GPT-OSS)';
    } else if (hasGemini) {
      aiAnalysis = await callGemini(prompt);
      provider = 'Google Gemini';
    } else {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      });
      aiAnalysis = message.content[0].text;
      provider = 'Claude';
    }

    res.json({
      ruleBasedAnalysis: ruleBasedResult,
      aiAnalysis,
      provider,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
