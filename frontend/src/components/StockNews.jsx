import React, { useState, useEffect } from 'react';
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

export default function StockNews({ symbol }) {
  const [news, setNews] = useState([]);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    axios.get(`/api/news/stock/${symbol}`)
      .then(res => { if (!cancelled) setNews(res.data); })
      .catch(() => { if (!cancelled) setNews([]); });
    return () => { cancelled = true; };
  }, [symbol]);

  if (news.length === 0) return null;

  return (
    <div className="news-card card">
      <div className="news-header">
        <h2 className="card-title">📰 관련 뉴스</h2>
      </div>
      <div className="news-list">
        {news.slice(0, 6).map(item => (
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
    </div>
  );
}
