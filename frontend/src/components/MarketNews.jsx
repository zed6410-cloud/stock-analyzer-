import React, { useState, useEffect, useCallback } from 'react';
import axios from '../api';
import './MarketNews.css';

function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

export default function MarketNews() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await axios.get('/api/news/market');
      setNews(res.data);
      setError(null);
    } catch (e) {
      setError('뉴스를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60 * 1000); // 1분마다 자동 갱신
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="news-card card">
      <div className="news-header">
        <h2 className="card-title">📰 국내 증시 실시간 뉴스</h2>
        <span className="news-live"><span className="news-dot" />LIVE</span>
      </div>

      {loading && <div className="news-loading">뉴스 불러오는 중...</div>}
      {error && <div className="news-error">{error}</div>}

      {!loading && !error && (
        <div className="news-list">
          {news.slice(0, 12).map(item => (
            <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="news-item">
              {item.image && <img className="news-thumb" src={item.image} alt="" />}
              <div className="news-body">
                <div className="news-title">{item.title}</div>
                <div className="news-summary">{item.summary}</div>
                <div className="news-meta">
                  <span className="news-source">{item.source}</span>
                  <span className="news-time">{timeAgo(item.publishedAt)}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
