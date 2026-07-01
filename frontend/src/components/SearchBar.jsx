import React, { useState, useEffect, useRef } from 'react';
import axios from '../api';
import './SearchBar.css';

export default function SearchBar({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const timerRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setNotFound(false);
    clearTimeout(timerRef.current);
    if (!val.trim()) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/stock/search?q=${encodeURIComponent(val)}`);
        setResults(res.data.slice(0, 8));
        setOpen(true);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 400);
  };

  const handleSelect = (symbol) => {
    setQuery(symbol);
    setOpen(false);
    setNotFound(false);
    onSelect(symbol);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setOpen(false);
    clearTimeout(timerRef.current);

    const isKorean = /[가-힣]/.test(trimmed);

    // 한글이 아니면 그대로 티커로 시도 (AAPL, 005930.KS 등 즉시 입력 지원)
    if (!isKorean) {
      setNotFound(false);
      onSelect(trimmed.toUpperCase());
      return;
    }

    // 한글 검색어는 디바운스된 상태에 의존하지 않고 즉시 실시간 검색
    setLoading(true);
    try {
      const res = await axios.get(`/api/stock/search?q=${encodeURIComponent(trimmed)}`);
      const found = res.data;
      if (found.length > 0) {
        setNotFound(false);
        onSelect(found[0].symbol);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="searchbar-wrap" ref={wrapRef}>
      <form onSubmit={handleSubmit} className="searchbar-form">
        <span className="search-icon">🔍</span>
        <input
          className="searchbar-input"
          type="text"
          placeholder="주식 이름 또는 티커 검색 (예: Apple, AAPL, 삼성전자, 005930.KS)"
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && <span className="search-spinner" />}
      </form>
      {open && results.length > 0 && (
        <ul className="search-dropdown">
          {results.map(r => (
            <li key={r.symbol} className="search-item" onClick={() => handleSelect(r.symbol)}>
              <span className="search-symbol">{r.symbol}</span>
              <span className="search-name">{r.name}</span>
              <span className="search-exchange">{r.exchange}</span>
            </li>
          ))}
        </ul>
      )}
      {notFound && (
        <div className="search-not-found">일치하는 종목을 찾지 못했습니다. 검색 결과 목록에서 선택해주세요.</div>
      )}
    </div>
  );
}
