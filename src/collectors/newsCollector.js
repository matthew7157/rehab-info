/**
 * 네이버 뉴스 검색 API 수집기
 * 발급: https://developers.naver.com/apps
 * 무료 한도: 25,000 req/day
 */

import { NAVER_CLIENT_ID, NAVER_CLIENT_SECRET } from '../config.js';

const NEWS_URL = 'https://openapi.naver.com/v1/search/news.json';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchNews(query, maxResults = 40) {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    console.warn('네이버 API 키 미설정 — 뉴스 수집 건너뜀');
    return [];
  }

  const articles = [];
  let start = 1;
  const display = 20;

  while (articles.length < maxResults) {
    const params = new URLSearchParams({
      query,
      display: Math.min(display, maxResults - articles.length),
      start,
      sort: 'date',
    });

    try {
      const resp = await fetch(`${NEWS_URL}?${params}`, {
        headers: {
          'X-Naver-Client-Id': NAVER_CLIENT_ID,
          'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = await resp.json();
      const items = data.items ?? [];
      if (!items.length) break;

      articles.push(...items);
      if (items.length < display) break;
      start += display;
      await sleep(300);
    } catch (e) {
      console.error(`뉴스 검색 실패 (${query}): ${e.message}`);
      break;
    }
  }

  return articles;
}

export async function collectNewsForCompany(name) {
  const results = [];
  for (const query of [`${name} 기업회생`, `${name} 회생신청`]) {
    results.push(...await searchNews(query, 20));
    await sleep(200);
  }

  // URL 중복 제거
  const seen = new Set();
  return results.filter(a => {
    if (seen.has(a.link)) return false;
    seen.add(a.link);
    return true;
  });
}

export async function collectNewsForCompanies(companies) {
  const result = {};
  for (const company of companies) {
    console.log(`뉴스 수집: ${company.name}`);
    const articles = await collectNewsForCompany(company.name);
    result[company.id] = articles;
    console.log(`  → ${articles.length}건`);
    await sleep(500);
  }
  return result;
}
