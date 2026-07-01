import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const CURL = 'C:\\Windows\\System32\\curl.exe';

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30분

export async function getYFSession() {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;

  // 쿠키 파일로 Yahoo Finance 접속
  const cookieFile = process.env.TEMP + '\\yf_cookies.txt';

  // finance.yahoo.com에서 쿠키 수집
  await execFileAsync(CURL, [
    '-s', '-L',
    '-c', cookieFile,
    '-b', cookieFile,
    '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    '-H', 'Accept: text/html,application/xhtml+xml',
    'https://finance.yahoo.com',
    '-o', 'NUL',
  ]);

  // 크럼 가져오기
  const { stdout: crumb } = await execFileAsync(CURL, [
    '-s',
    '-b', cookieFile,
    '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'https://query2.finance.yahoo.com/v1/test/getcrumb',
  ]);

  // 쿠키 파일 읽기
  const { stdout: cookieRaw } = await execFileAsync(CURL, [
    '-s',
    '-b', cookieFile,
    '-c', cookieFile,
    '-A', 'Mozilla/5.0',
    'https://query2.finance.yahoo.com/v1/test/getcrumb',
    '-D', '-',
    '-o', 'NUL',
  ]).catch(() => ({ stdout: '' }));

  _cache = { crumb: crumb.trim(), cookieFile };
  _cacheTime = Date.now();
  console.log('YF 인증 완료, crumb:', _cache.crumb?.slice(0, 8) + '...');
  return _cache;
}

export async function yfFetch(url, params = {}) {
  const { crumb, cookieFile } = await getYFSession();

  const paramStr = new URLSearchParams({ ...params, crumb }).toString();
  const fullUrl = `${url}?${paramStr}`;

  const { stdout } = await execFileAsync(CURL, [
    '-s',
    '-b', cookieFile,
    '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    '-H', 'Accept: application/json',
    fullUrl,
  ]);

  return JSON.parse(stdout);
}
