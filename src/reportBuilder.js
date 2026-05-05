/**
 * HTML 리포트 생성 공통 모듈 (report.js · mailer.js 공유)
 */
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'fs';
import { DB_PATH } from './config.js';

export function buildReport(outputPath) {
  const db = new DatabaseSync(DB_PATH);

  const companies = db.prepare(`
    SELECT c.id, c.name, c.case_number, c.application_date, c.court, c.industry, c.collected_at
    FROM companies c
    ORDER BY c.application_date DESC NULLS LAST
  `).all();

  const newsMap = {};
  db.prepare('SELECT company_id, title, url, published_at FROM news ORDER BY published_at DESC').all()
    .forEach(n => {
      if (!newsMap[n.company_id]) newsMap[n.company_id] = [];
      newsMap[n.company_id].push(n);
    });

  const today  = new Date().toISOString().slice(0, 10);
  const total  = companies.length;
  const noNews = companies.filter(c => !(newsMap[c.id]?.length)).length;
  const noInds = companies.filter(c => !c.industry).length;

  const rows = companies.map(c => {
    const news = newsMap[c.id] || [];
    const newsHtml = news.length
      ? news.map(n => `
          <li>
            <a href="${n.url}" target="_blank" rel="noopener">${n.title.replace(/<[^>]+>/g, '')}</a>
            <span class="date">${(n.published_at || '').slice(0, 10)}</span>
          </li>`).join('')
      : '<li class="none">수집된 기사 없음</li>';

    const nameEsc = c.name.replace(/'/g, "\\'");
    const courtHref = c.case_number
      ? `https://www.scourt.go.kr/portal/notice/reimburse/ReimburseList.work?searchWord=${encodeURIComponent(c.case_number)}`
      : null;

    return `
    <tr>
      <td>${c.application_date || '-'}</td>
      <td class="name">
        ${c.name}
        <div class="links">
          <a href="javascript:copyAndOpenDart('${nameEsc}')" title="DART 공시 검색 (회사명 자동 복사)">📋 DART</a>
          ${courtHref ? `<a href="${courtHref}" target="_blank" title="법원 공고 검색">⚖️ 법원</a>` : ''}
        </div>
      </td>
      <td>${c.case_number || '-'}</td>
      <td>${c.court || '-'}</td>
      <td>${c.industry || '<span class="none">미처리</span>'}</td>
      <td>
        <details>
          <summary>${news.length}건</summary>
          <ul class="news-list">${newsHtml}</ul>
        </details>
      </td>
    </tr>`;
  }).join('');

  const courtOptions = [...new Set(companies.map(c => c.court).filter(Boolean))].sort()
    .map(c => `<option value="${c}">${c}</option>`).join('');
  const indOptions = [...new Set(companies.map(c => c.industry).filter(Boolean))].sort()
    .map(i => `<option value="${i}">${i}</option>`).join('');

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>기업회생 수집 현황 ${today}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Malgun Gothic', sans-serif; font-size: 13px; background: #f5f5f5; color: #222; }
  header { background: #1a3a5c; color: #fff; padding: 16px 24px; }
  header h1 { font-size: 18px; margin-bottom: 6px; }
  .stats { display: flex; gap: 24px; padding: 12px 24px; background: #fff; border-bottom: 1px solid #ddd; flex-wrap: wrap; }
  .stat { text-align: center; padding: 4px 8px; }
  .stat .val { font-size: 22px; font-weight: bold; color: #1a3a5c; }
  .stat .lbl { font-size: 11px; color: #666; }
  .toolbar { padding: 10px 24px; background: #fff; border-bottom: 1px solid #ddd; display: flex; gap: 8px; align-items: center; }
  .toolbar input { border: 1px solid #ccc; border-radius: 4px; padding: 5px 10px; width: 220px; font-size: 13px; }
  .toolbar select { border: 1px solid #ccc; border-radius: 4px; padding: 5px 8px; font-size: 13px; }
  .wrap { padding: 12px 24px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.1); }
  th { background: #1a3a5c; color: #fff; padding: 9px 10px; text-align: left; font-size: 12px; position: sticky; top: 0; }
  td { padding: 8px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr:hover td { background: #f0f6ff; }
  .name { font-weight: bold; min-width: 160px; }
  .links { margin-top: 4px; display: flex; gap: 6px; }
  .links a { font-size: 11px; background: #e8f0fe; color: #1a73e8; padding: 2px 6px; border-radius: 3px; text-decoration: none; white-space: nowrap; cursor: pointer; }
  .links a:hover { background: #1a73e8; color: #fff; }
  .none { color: #aaa; font-size: 11px; }
  .date { margin-left: 8px; color: #888; font-size: 11px; }
  details summary { cursor: pointer; color: #1a3a5c; font-size: 12px; }
  .news-list { list-style: none; padding: 6px 0 0 0; }
  .news-list li { padding: 3px 0; border-top: 1px solid #f0f0f0; font-size: 12px; }
  .news-list a { color: #1a73e8; text-decoration: none; }
  .news-list a:hover { text-decoration: underline; }
</style>
</head>
<body>
<header>
  <h1>기업회생 수집 현황</h1>
  <div style="font-size:12px;opacity:.8">${today} 기준 · DART 공시·네이버 뉴스 연동</div>
</header>

<div class="stats">
  <div class="stat"><div class="val">${total}</div><div class="lbl">수집 기업</div></div>
  <div class="stat"><div class="val">${total - noNews}</div><div class="lbl">뉴스 있음</div></div>
  <div class="stat"><div class="val">${total - noInds}</div><div class="lbl">업종 확인</div></div>
  <div class="stat"><div class="val">${noInds}</div><div class="lbl">업종 미처리</div></div>
</div>

<div class="toolbar">
  <input id="searchBox" type="text" placeholder="기업명 검색..." oninput="filterTable()">
  <select id="courtFilter" onchange="filterTable()">
    <option value="">전체 법원</option>
    ${courtOptions}
  </select>
  <select id="indFilter" onchange="filterTable()">
    <option value="">전체 업종</option>
    <option value="__none__">업종 미처리</option>
    ${indOptions}
  </select>
  <span id="countLabel" style="color:#666;font-size:12px"></span>
</div>

<div class="wrap">
<table id="mainTable">
  <thead>
    <tr>
      <th style="width:100px">신청일</th>
      <th>기업명 / 링크</th>
      <th style="width:160px">사건번호</th>
      <th style="width:130px">법원</th>
      <th style="width:160px">업종</th>
      <th style="width:80px">뉴스</th>
    </tr>
  </thead>
  <tbody id="tableBody">
    ${rows}
  </tbody>
</table>
</div>

<script>
function copyAndOpenDart(name) {
  navigator.clipboard.writeText(name).catch(() => {});
  window.open('https://dart.fss.or.kr/dsab001/main.do', '_blank');
  const t = document.createElement('div');
  t.textContent = '"' + name + '" 복사됨 — DART 검색창에 붙여넣기(Ctrl+V)';
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#323232;color:#fff;padding:10px 20px;border-radius:6px;font-size:13px;z-index:9999;white-space:nowrap';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

const allRows = Array.from(document.getElementById('tableBody').querySelectorAll('tr'));

function filterTable() {
  const kw    = document.getElementById('searchBox').value.toLowerCase();
  const court = document.getElementById('courtFilter').value;
  const ind   = document.getElementById('indFilter').value;
  let shown = 0;
  allRows.forEach(tr => {
    const text    = tr.textContent.toLowerCase();
    const courtOk = !court || tr.cells[3]?.textContent.trim() === court;
    const indCell = tr.cells[4]?.textContent.trim();
    const indOk   = !ind
      || (ind === '__none__' && (!indCell || indCell === '미처리'))
      || (ind !== '__none__' && indCell === ind);
    const visible = (!kw || text.includes(kw)) && courtOk && indOk;
    tr.style.display = visible ? '' : 'none';
    if (visible) shown++;
  });
  document.getElementById('countLabel').textContent = shown + '건 표시 중';
}

filterTable();
</script>
</body>
</html>`;

  if (outputPath) writeFileSync(outputPath, html, 'utf-8');
  return { html, total, noInds, today };
}
