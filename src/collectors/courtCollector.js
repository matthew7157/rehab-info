/**
 * 대법원 월별 공고 엑셀 파일 수집기
 *
 * 소스: https://www.scourt.go.kr/portal/news/NewsListAction.work?gubun=955
 *   - 법원이 매월 올리는 '법인회생사건 인터넷공고 목록' 엑셀 다운로드
 *   - 엑셀 컬럼: 번호 | 법원 | 사건번호 | 재판부 | 채무자 | 생년월일 | 공고게시일 | 공고 제목
 *
 * 보완 소스: MaNoticeList (M&A 공고 게시판)
 *   - 업종, 상장 여부 추가
 */

import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const LIST_URL   = 'https://www.scourt.go.kr/portal/news/NewsListAction.work?gubun=955';
const DL_URL     = 'https://file.scourt.go.kr/AttachDownload';
const MNA_URL    = 'https://www.scourt.go.kr/portal/notice/mainfo/MaNoticeList.work';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Referer': 'https://www.scourt.go.kr/',
};

// 회생 관련 공고 제목 필터 (파산 제외, 개인회생 제외)
const REHAB_TITLES = ['회생', '포괄적금지', '조사위원', '보전처분', '중지명령', '개시결정', '관리인'];
const EXCLUDE_TITLES = ['개인회생', '파산'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── 엑셀 파일 목록 수집 (페이지네이션 포함) ────────────────────

// 표시명에서 연도/월 파싱: "2025년 3월 법인회생..." → { year:2025, month:3 }
function parseDisplayNameDate(displayName) {
  const m = /(\d{4})년\s*(\d{1,2})월/.exec(displayName);
  if (!m) return null;
  return { year: parseInt(m[1]), month: parseInt(m[2]) };
}

async function fetchFileListPage(page) {
  const url  = `${LIST_URL}&pageIndex=${page}`;
  const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  const buf  = await resp.arrayBuffer();
  const ct   = resp.headers.get('content-type') || '';
  const html = ct.includes('euc-kr')
    ? iconv.decode(Buffer.from(buf), 'euc-kr')
    : Buffer.from(buf).toString('utf-8');

  const $ = cheerio.load(html);
  const files = [];

  $('[onclick], a[href]').each((_, el) => {
    const attr = $(el).attr('onclick') || $(el).attr('href') || '';
    const m = /download\('([^']+)','([^']+)'\)/.exec(attr);
    if (!m) return;
    const [, fileId, displayName] = m;
    if (displayName.includes('법인회생') || displayName.includes('회생사건')) {
      files.push({ fileId, displayName });
    }
  });

  return files;
}

// FROM_YEAR년 FROM_MONTH월 이후 파일만 수집 (기본: 직전년도 1월)
async function fetchFileList(fromYear = new Date().getFullYear() - 1, fromMonth = 1) {
  const all = [];

  for (let page = 1; page <= 20; page++) {
    const files = await fetchFileListPage(page);
    if (!files.length) break;

    let foundOldFile = false;
    for (const f of files) {
      const d = parseDisplayNameDate(f.displayName);
      if (!d) continue;
      // fromYear/fromMonth 이전 파일이 나오면 수집 종료
      if (d.year < fromYear || (d.year === fromYear && d.month < fromMonth)) {
        foundOldFile = true;
        break;
      }
      all.push(f);
    }

    if (foundOldFile) break;
    await sleep(1000);
  }

  console.log(`[COURT] 수집 대상 엑셀 ${all.length}개 (${fromYear}년 ${fromMonth}월 이후)`);
  return all;
}

// ─── 엑셀 다운로드 ───────────────────────────────────────────

async function downloadExcel(fileId, displayName) {
  const body = new URLSearchParams({ file: fileId, path: '007', downFile: displayName });
  const resp = await fetch(DL_URL, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  if (buf.byteLength < 1000) throw new Error('응답 크기 너무 작음 (다운로드 실패)');
  return Buffer.from(buf);
}

// ─── 엑셀 파싱 ───────────────────────────────────────────────

function parseExcel(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // 헤더 행 찾기 (사건번호 컬럼이 있는 행)
  let headerIdx = -1;
  let colMap    = {};
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i].map(c => String(c).trim());
    const caseCol = row.findIndex(c => c.includes('사건번호'));
    if (caseCol >= 0) {
      headerIdx = i;
      row.forEach((h, j) => { colMap[h] = j; });
      break;
    }
  }
  if (headerIdx < 0) return [];

  const get = (row, key) => String(row[colMap[key] ?? -1] ?? '').trim();

  const results = [];
  for (const row of rows.slice(headerIdx + 1)) {
    const caseNumber = get(row, '사건번호');
    const name       = get(row, '채무자');
    const court      = get(row, '법원');
    const date       = get(row, '공고게시일');
    const title      = get(row, '공고 제목');

    if (!caseNumber || !name) continue;

    // 2025~2026년 사건만 (사건번호 앞 4자리 연도 기준)
    const caseYear = parseInt(caseNumber.slice(0, 4));
    if (caseYear < 2025 || caseYear > 2026) continue;

    // 회생 관련 공고만 (개인 제외)
    const isRehab    = REHAB_TITLES.some(t => title.includes(t) || caseNumber.includes('회합') || caseNumber.includes('회단'));
    const isExcluded = EXCLUDE_TITLES.some(t => title.includes(t) || name.length < 2);
    if (!isRehab || isExcluded) continue;

    results.push({
      name,
      case_number: caseNumber,
      application_date: parseDate(date),
      court: court || '미상',
      source_url: LIST_URL,
    });
  }
  return results;
}

function parseDate(text) {
  const m = /(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/.exec(text);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

// ─── M&A 공고 게시판 (업종 수집) ─────────────────────────────

export async function collectMnaList(maxPages = 10) {
  const results = [];
  for (let page = 1; page <= maxPages; page++) {
    try {
      const resp = await fetch(
        `${MNA_URL}?pageIndex=${page}`,
        { headers: HEADERS, signal: AbortSignal.timeout(15000) }
      );
      const buf  = await resp.arrayBuffer();
      const ct   = resp.headers.get('content-type') || '';
      const html = ct.includes('euc-kr')
        ? iconv.decode(Buffer.from(buf), 'euc-kr')
        : Buffer.from(buf).toString('utf-8');

      const $    = cheerio.load(html);
      const rows = $('table tbody tr');
      if (!rows.length) break;

      rows.each((_, tr) => {
        const cells = $('td', tr);
        if (cells.length < 4) return;

        const court = cells.eq(1).text().trim();

        // cells[2]: 업종 — 링크 안의 보이는 텍스트 (숨겨진 span 제거 후)
        const industryCell = cells.eq(2).clone();
        industryCell.find('span').remove();
        const industry = industryCell.find('a').text().replace(/\s+/g, ' ').trim();

        // cells[3]: 회사명 — 링크 텍스트
        const name = cells.eq(3).find('a').text().replace(/\s+/g, ' ').trim();
        if (!name) return;

        const href  = cells.eq(3).find('a').attr('href') || cells.eq(2).find('a').attr('href') || '';
        const seqM  = /seqnum=(\d+)/.exec(href);
        const date  = cells.last().text().trim();

        results.push({
          name,
          industry: industry || null,
          court,
          date:   parseDate(date),
          seqnum: seqM ? seqM[1] : null,
          source: 'mna',
        });
      });

      console.log(`[MNA] ${page}페이지 ${rows.length}건`);
      await sleep(1200);
    } catch (e) {
      console.error(`[MNA] ${page}페이지 실패:`, e.message);
      break;
    }
  }
  return results;
}

// ─── 통합 수집 ───────────────────────────────────────────────

function dedup(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item.case_number) return true;
    if (seen.has(item.case_number)) return false;
    seen.add(item.case_number);
    return true;
  });
}

export async function collectAll() {
  const all = [];
  const fromYear  = new Date().getFullYear() - 1;  // 직전년도
  const fromMonth = 1;                              // 1월부터

  // 엑셀 파일 목록 (직전년도 1월 이후 전체)
  let files;
  try {
    files = await fetchFileList(fromYear, fromMonth);
  } catch (e) {
    console.error('[COURT] 파일 목록 수집 실패:', e.message);
    files = [];
  }

  for (const { fileId, displayName } of files) {
    console.log(`[COURT] 다운로드: ${displayName}`);
    try {
      const buf  = await downloadExcel(fileId, displayName);
      const rows = parseExcel(buf);
      console.log(`  → ${rows.length}건 파싱`);
      all.push(...rows);
      await sleep(2000);
    } catch (e) {
      console.error(`  [오류] ${displayName}:`, e.message);
    }
  }

  const result = dedup(all);
  console.log(`법원 공고 총 ${result.length}건 (중복 제거 후)`);
  return result;
}
