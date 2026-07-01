const KEY = 'stockai_watchlist';

export function getWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

export function isWatched(symbol) {
  return getWatchlist().some(w => w.symbol === symbol);
}

export function toggleWatch(symbol, name) {
  const list = getWatchlist();
  const idx = list.findIndex(w => w.symbol === symbol);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.unshift({ symbol, name });
  }
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 30)));
  return list;
}
