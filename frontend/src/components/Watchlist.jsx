import React, { useState, useEffect } from 'react';
import { getWatchlist } from '../watchlist';
import './Watchlist.css';

export default function Watchlist({ onSelect }) {
  const [list, setList] = useState([]);

  useEffect(() => {
    setList(getWatchlist());
  }, []);

  if (list.length === 0) return null;

  return (
    <div className="watchlist-card card">
      <h2 className="card-title">★ 관심종목</h2>
      <div className="watchlist-items">
        {list.map(w => (
          <button key={w.symbol} className="watchlist-item" onClick={() => onSelect(w.symbol)}>
            <span className="wl-symbol">{w.symbol}</span>
            <span className="wl-name">{w.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
