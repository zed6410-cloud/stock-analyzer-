import express from 'express';
import axios from 'axios';

const router = express.Router();

const NAVER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 간단한 인메모리 캐시 (뉴스는 자주 안 바뀌므로 짧게 캐시해 요청 수를 줄임)
const _cache = new Map();
function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) { _cache.delete(key); return undefined; }
  return hit.value;
}
function cacheSet(key, value, ttlMs) {
  _cache.set(key, { value, expires: Date.now() + ttlMs });
}

function parseDatetime(raw) {
  // "202607020112" -> "2026-07-02T01:12:00"
  if (!raw || raw.length < 12) return null;
  const y = raw.slice(0, 4), mo = raw.slice(4, 6), d = raw.slice(6, 8), h = raw.slice(8, 10), mi = raw.slice(10, 12);
  return `${y}-${mo}-${d}T${h}:${mi}:00`;
}

function normalizeArticles(raw) {
  return (raw || [])
    .flatMap(entry => entry.items || [])
    .map(it => ({
      id: it.id,
      title: it.titleFull || it.title,
      summary: (it.body || '').replace(/\s+/g, ' ').trim(),
      source: it.officeName,
      image: it.imageOriginLink || null,
      url: it.mobileNewsUrl,
      publishedAt: parseDatetime(it.datetime),
    }))
    .filter(a => a.title && a.url);
}

async function fetchNaverNews(code, pageSize = 20) {
  const res = await axios.get(`https://m.stock.naver.com/api/news/stock/${code}`, {
    params: { page: 1, pageSize },
    headers: { 'User-Agent': NAVER_UA },
    timeout: 6000,
  });
  return normalizeArticles(res.data);
}

// 국내 증시 전체 뉴스 (코스피 + 코스닥)
router.get('/market', async (req, res) => {
  try {
    const cacheKey = 'news:market';
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const [kospi, kosdaq] = await Promise.all([
      fetchNaverNews('KOSPI', 15).catch(() => []),
      fetchNaverNews('KOSDAQ', 15).catch(() => []),
    ]);

    const seen = new Set();
    const merged = [...kospi, ...kosdaq]
      .filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; })
      .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));

    cacheSet(cacheKey, merged, 3 * 60 * 1000);
    res.json(merged);
  } catch (err) {
    console.error('market news error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 개별 종목 뉴스 (한국 주식만 지원 - 네이버 데이터 기준)
router.get('/stock/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const code = symbol.replace(/\.(KS|KQ)$/i, '');
    if (!/^\d{6}$/.test(code)) return res.json([]); // 한국 주식 코드가 아니면 빈 배열

    const cacheKey = `news:stock:${code}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const articles = await fetchNaverNews(code, 10);
    cacheSet(cacheKey, articles, 3 * 60 * 1000);
    res.json(articles);
  } catch (err) {
    console.error('stock news error:', err.message);
    res.json([]);
  }
});

export default router;
