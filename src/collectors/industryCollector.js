/**
 * 업종 정보 수집기
 *
 * 우선순위:
 *   1. M&A 공고 게시판 (scourt.go.kr/portal/notice/mainfo/MaNoticeList)
 *      — 법원 회생회사 목록, 업종 직접 기재
 *   2. DART API (금융감독원) — 공시 기업
 *      발급: https://opendart.fss.or.kr/api/intro.do  (무료, 10,000건/일)
 *   3. 네이버 검색 스크래핑 — fallback
 */

import * as cheerio from 'cheerio';
import { DART_API_KEY } from '../config.js';
import { getCompaniesWithoutIndustry, updateIndustry, getAllCompanies } from '../db/database.js';
import { collectMnaList } from './courtCollector.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── 1. M&A 게시판 업종 매핑 ─────────────────────────────────

export async function syncMnaIndustry() {
  const mnaItems = await collectMnaList(20);  // 최대 20페이지
  if (!mnaItems.length) return;

  const companies = getAllCompanies();
  const companyMap = new Map(companies.map(c => [normalize(c.name), c.id]));

  let updated = 0;
  for (const item of mnaItems) {
    if (!item.industry || !item.name) continue;
    const cid = companyMap.get(normalize(item.name));
    if (cid) {
      updateIndustry(cid, item.industry);
      updated++;
    }
  }
  console.log(`[MNA] 업종 업데이트: ${updated}건`);
}

function normalize(name) {
  return name
    .replace(/\s+/g, '')
    .replace(/주식회사|㈜|\(주\)|\(유\)|유한회사/g, '')
    .toLowerCase();
}

// ─── 2. DART API ─────────────────────────────────────────────

async function dartGetIndustry(name) {
  if (!DART_API_KEY) return null;
  try {
    const params = new URLSearchParams({ crtfc_key: DART_API_KEY, corp_name: name, page_count: 5 });
    const resp = await fetch(`https://opendart.fss.or.kr/api/company.json?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const items = data.list ?? [];
    const match = items.find(i => normalize(i.corp_name) === normalize(name)) ?? items[0];
    return match?.induty ?? null;
  } catch {
    return null;
  }
}

// ─── 3. 네이버 스크래핑 ─────────────────────────────────────

const NAV_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

async function naverGetIndustry(name) {
  try {
    const params = new URLSearchParams({ query: `${name} 업종 회사`, where: 'web' });
    const resp = await fetch(`https://search.naver.com/search.naver?${params}`, {
      headers: NAV_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    const html = await resp.text();
    const $    = cheerio.load(html);

    for (const sel of ['.company_info', '.whois_info', '[class*="company"]']) {
      const text = $(sel).first().text();
      const m    = /업종[:\s]+([^\n,]+)/.exec(text);
      if (m) return m[1].trim();
    }

    let found = null;
    $('.total_wrap .api_txt_lines, .dsc_txt').each((_, el) => {
      if (found) return;
      const m = /업종[:\s]+([^\n,]+)/.exec($(el).text());
      if (m) found = m[1].trim();
    });
    return found;
  } catch {
    return null;
  }
}

// ─── 통합 실행 ───────────────────────────────────────────────

// 1회 실행당 Naver 개별 조회 최대 건수 (과부하 방지)
const MAX_NAVER_PER_RUN = parseInt(process.env.MAX_NAVER_QUERIES || '50');

export async function enrichIndustry() {
  // 1단계: M&A 게시판 동기화 (한 번에 많은 기업 업종 채움)
  await syncMnaIndustry();

  // 2단계: 여전히 업종 없는 기업에 개별 조회 (매일 조금씩 채움)
  const rows = getCompaniesWithoutIndustry();
  if (!rows.length) return;

  const targets = rows.slice(0, MAX_NAVER_PER_RUN);
  console.log(`개별 업종 조회: ${targets.length}건 (미처리 ${rows.length - targets.length}건은 다음 실행 시 처리)`);

  for (const row of targets) {
    let industry = null;

    if (DART_API_KEY) {
      industry = await dartGetIndustry(row.name);
      await sleep(300);
    }

    if (!industry) {
      industry = await naverGetIndustry(row.name);
      await sleep(800);
    }

    if (industry) {
      updateIndustry(row.id, industry);
      console.log(`  ${row.name} → ${industry}`);
    }
  }
}
