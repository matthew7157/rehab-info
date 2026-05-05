/**
 * 수집 데이터 조회 / CSV 내보내기
 *
 * 사용법:
 *   node view.js              → 통계 요약 출력
 *   node view.js list         → 기업 목록 출력 (최신 50건)
 *   node view.js list 100     → 최신 100건
 *   node view.js search 삼성  → 기업명 검색
 *   node view.js csv          → companies.csv 내보내기
 *   node view.js news 삼성    → 특정 기업 뉴스 목록
 */

import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'fs';
import { existsSync } from 'fs';

const DB_PATH = './data/rehab.db';

if (!existsSync(DB_PATH)) {
  console.error('DB 파일 없음: data/rehab.db\n먼저 node src/main.js 로 데이터를 수집하세요.');
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);

const [, , cmd, arg] = process.argv;

if (!cmd || cmd === 'stat') {
  printStat();
} else if (cmd === 'list') {
  listCompanies(parseInt(arg) || 50);
} else if (cmd === 'search') {
  if (!arg) { console.error('검색어를 입력하세요. 예: node view.js search 삼성'); process.exit(1); }
  searchCompany(arg);
} else if (cmd === 'csv') {
  exportCsv();
} else if (cmd === 'news') {
  if (!arg) { console.error('기업명을 입력하세요. 예: node view.js news 삼성'); process.exit(1); }
  listNews(arg);
} else {
  console.log('알 수 없는 명령: ' + cmd);
  console.log('사용법: node view.js [stat|list|search|csv|news]');
}

// ─── 통계 요약 ────────────────────────────────────────────────

function printStat() {
  const total   = db.prepare('SELECT COUNT(*) AS n FROM companies').get().n;
  const noInds  = db.prepare("SELECT COUNT(*) AS n FROM companies WHERE industry IS NULL OR industry=''").get().n;
  const withNews = db.prepare('SELECT COUNT(DISTINCT company_id) AS n FROM news').get().n;
  const newsTotal = db.prepare('SELECT COUNT(*) AS n FROM news').get().n;

  const courts = db.prepare(`
    SELECT court, COUNT(*) AS n FROM companies
    GROUP BY court ORDER BY n DESC LIMIT 10
  `).all();

  const industries = db.prepare(`
    SELECT industry, COUNT(*) AS n FROM companies
    WHERE industry IS NOT NULL AND industry != ''
    GROUP BY industry ORDER BY n DESC LIMIT 15
  `).all();

  const monthly = db.prepare(`
    SELECT substr(application_date,1,7) AS ym, COUNT(*) AS n
    FROM companies
    WHERE application_date IS NOT NULL
    GROUP BY ym ORDER BY ym DESC LIMIT 12
  `).all();

  console.log('\n====== 기업회생 수집 현황 ======');
  console.log(`수집 기업 수 : ${total}건`);
  console.log(`업종 미처리  : ${noInds}건`);
  console.log(`뉴스 있는 기업: ${withNews}건 (뉴스 ${newsTotal}건)`);

  console.log('\n── 법원별 ──');
  courts.forEach(r => console.log(`  ${(r.court || '미상').padEnd(18)} ${r.n}건`));

  if (industries.length) {
    console.log('\n── 업종별 (상위 15) ──');
    industries.forEach(r => console.log(`  ${String(r.industry).padEnd(20)} ${r.n}건`));
  }

  if (monthly.length) {
    console.log('\n── 월별 신청 건수 ──');
    monthly.forEach(r => console.log(`  ${r.ym}  ${r.n}건`));
  }
  console.log('');
}

// ─── 기업 목록 ───────────────────────────────────────────────

function listCompanies(limit) {
  const rows = db.prepare(`
    SELECT name, case_number, application_date, court, industry
    FROM companies
    ORDER BY application_date DESC NULLS LAST, collected_at DESC
    LIMIT ?
  `).all(limit);

  console.log(`\n최신 ${limit}건 기업 목록`);
  console.log('기업명'.padEnd(20) + '사건번호'.padEnd(22) + '신청일'.padEnd(14) + '법원'.padEnd(18) + '업종');
  console.log('─'.repeat(90));
  rows.forEach(r => {
    console.log(
      (r.name || '').substring(0, 18).padEnd(20) +
      (r.case_number || '').padEnd(22) +
      (r.application_date || '').padEnd(14) +
      (r.court || '').padEnd(18) +
      (r.industry || '(미처리)')
    );
  });
  console.log('');
}

// ─── 검색 ────────────────────────────────────────────────────

function searchCompany(keyword) {
  const rows = db.prepare(`
    SELECT c.name, c.case_number, c.application_date, c.court, c.industry,
           COUNT(n.id) AS news_count
    FROM companies c
    LEFT JOIN news n ON n.company_id = c.id
    WHERE c.name LIKE ?
    GROUP BY c.id
    ORDER BY c.application_date DESC
  `).all(`%${keyword}%`);

  if (!rows.length) { console.log(`"${keyword}" 검색 결과 없음`); return; }

  console.log(`\n"${keyword}" 검색 결과 ${rows.length}건`);
  rows.forEach(r => {
    console.log(`\n기업명   : ${r.name}`);
    console.log(`사건번호 : ${r.case_number || '-'}`);
    console.log(`신청일   : ${r.application_date || '-'}`);
    console.log(`법원     : ${r.court || '-'}`);
    console.log(`업종     : ${r.industry || '(미처리)'}`);
    console.log(`뉴스     : ${r.news_count}건`);
  });
  console.log('');
}

// ─── 뉴스 목록 ───────────────────────────────────────────────

function listNews(keyword) {
  const company = db.prepare('SELECT id, name FROM companies WHERE name LIKE ? LIMIT 1').get(`%${keyword}%`);
  if (!company) { console.log(`"${keyword}" 기업 없음`); return; }

  const rows = db.prepare(`
    SELECT title, url, published_at FROM news
    WHERE company_id = ?
    ORDER BY published_at DESC
    LIMIT 30
  `).all(company.id);

  console.log(`\n[${company.name}] 뉴스 ${rows.length}건`);
  rows.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.title}`);
    console.log(`   ${r.published_at || '날짜미상'}`);
    console.log(`   ${r.url}`);
  });
  console.log('');
}

// ─── CSV 내보내기 ─────────────────────────────────────────────

function exportCsv() {
  const rows = db.prepare(`
    SELECT c.name, c.case_number, c.application_date, c.court, c.industry,
           c.source_url, c.collected_at,
           COUNT(n.id) AS news_count
    FROM companies c
    LEFT JOIN news n ON n.company_id = c.id
    GROUP BY c.id
    ORDER BY c.application_date DESC NULLS LAST
  `).all();

  const header = '기업명,사건번호,신청일,법원,업종,뉴스건수,수집일시\n';
  const body = rows.map(r =>
    [
      `"${(r.name || '').replace(/"/g, '""')}"`,
      `"${r.case_number || ''}"`,
      r.application_date || '',
      `"${r.court || ''}"`,
      `"${(r.industry || '').replace(/"/g, '""')}"`,
      r.news_count,
      r.collected_at?.slice(0, 10) || '',
    ].join(',')
  ).join('\n');

  const filename = `companies_${new Date().toISOString().slice(0, 10)}.csv`;
  writeFileSync(filename, '﻿' + header + body, 'utf-8'); // BOM 추가 (엑셀 한글 호환)
  console.log(`CSV 저장 완료: ${filename} (${rows.length}건)`);
}
