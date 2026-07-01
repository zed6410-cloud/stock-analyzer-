import React, { useState, useEffect, useRef } from 'react';
import axios from '../api';
import './SearchBar.css';

export default function SearchBar({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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
    onSelect(symbol);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) { setOpen(false); onSelect(query.trim().toUpperCase()); }
  };

  return (
    <div className="searchbar-wrap" ref={wrapRef}>
      <form onSubmit={handleSubmit} className="searchbar-form">
        <span className="search-icon">🔍</span>
        <input
          className="searchbar-input"
          type="text"
          placeholder="영문 이름 또는 티커로 검색 (예: Apple, AAPL, Samsung, 005930.KS)"
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
    </div>
  );
}
