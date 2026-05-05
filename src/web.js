import express from 'express';
import { initDb, getAllCompanies } from './db/database.js';

const app = express();
const PORT = 3001;

initDb();

app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>기업회생정보 대시보드</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:#08090f;color:#e2e8f0;min-height:100vh;padding:40px 24px}
    a.back{display:inline-flex;align-items:center;gap:6px;color:#64748b;font-size:.82rem;text-decoration:none;margin-bottom:32px}
    a.back:hover{color:#e2e8f0}
    h1{font-size:1.6rem;font-weight:700;margin-bottom:6px}
    .sub{color:#64748b;font-size:.88rem;margin-bottom:36px}
    .stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;margin-bottom:36px}
    .stat{background:#111420;border:1px solid #1e2538;border-radius:12px;padding:18px 20px}
    .stat-val{font-size:1.8rem;font-weight:700;color:#fbbf24}
    .stat-label{font-size:.78rem;color:#64748b;margin-top:4px}
    .card{background:#111420;border:1px solid #1e2538;border-radius:14px;overflow:hidden}
    .card-head{padding:16px 20px;border-bottom:1px solid #1e2538;display:flex;align-items:center;justify-content:space-between}
    .card-head h2{font-size:.95rem;font-weight:600}
    table{width:100%;border-collapse:collapse}
    th{padding:10px 16px;text-align:left;font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#475569;background:#0a0d14;border-bottom:1px solid #1e2538}
    td{padding:11px 16px;font-size:.83rem;border-bottom:1px solid #111827}
    tr:last-child td{border-bottom:none}
    tr:hover td{background:#111827}
    .empty{padding:40px;text-align:center;color:#334155;font-size:.88rem}
    .badge{font-size:.68rem;font-weight:600;padding:3px 8px;border-radius:999px;background:#1e2538;color:#94a3b8}
    .badge.court{background:#1e3a5f;color:#93c5fd}
  </style>
</head>
<body>
  <a class="back" href="javascript:history.back()">← 대시보드로</a>
  <h1>⚖️ 기업회생정보</h1>
  <p class="sub">법원 기업회생 공시 자동 수집 시스템</p>

  <div class="stats" id="stats">
    <div class="stat"><div class="stat-val" id="total">—</div><div class="stat-label">수집 기업</div></div>
    <div class="stat"><div class="stat-val" id="courts">—</div><div class="stat-label">법원 수</div></div>
    <div class="stat"><div class="stat-val" id="latest">—</div><div class="stat-label">최근 수집</div></div>
  </div>

  <div class="card">
    <div class="card-head">
      <h2>수집된 기업 목록</h2>
      <span class="badge" id="count">로딩 중...</span>
    </div>
    <div id="table-wrap">
      <div class="empty">데이터를 불러오는 중...</div>
    </div>
  </div>

  <script>
    fetch('/api/companies').then(r=>r.json()).then(data=>{
      const rows = data.companies || [];
      document.getElementById('total').textContent = rows.length;
      const courts = [...new Set(rows.map(r=>r.court).filter(Boolean))].length;
      document.getElementById('courts').textContent = courts;
      const latest = rows[0]?.collected_at?.slice(0,10) || '없음';
      document.getElementById('latest').textContent = latest;
      document.getElementById('count').textContent = rows.length + '건';

      if(!rows.length){
        document.getElementById('table-wrap').innerHTML='<div class="empty">수집된 데이터가 없습니다.<br>npm start 를 실행해 데이터를 수집하세요.</div>';
        return;
      }
      const html = \`<table>
        <thead><tr><th>#</th><th>기업명</th><th>사건번호</th><th>법원</th><th>신청일</th><th>업종</th><th>수집일</th></tr></thead>
        <tbody>\${rows.map((r,i)=>\`<tr>
          <td style="color:#475569">\${i+1}</td>
          <td style="font-weight:600">\${r.name||'-'}</td>
          <td><code style="font-size:.76rem;color:#7dd3fc">\${r.case_number||'-'}</code></td>
          <td><span class="badge court">\${r.court||'-'}</span></td>
          <td>\${r.application_date||'-'}</td>
          <td>\${r.industry||'-'}</td>
          <td style="color:#475569;font-size:.76rem">\${(r.collected_at||'').slice(0,10)}</td>
        </tr>\`).join('')}</tbody>
      </table>\`;
      document.getElementById('table-wrap').innerHTML = html;
    }).catch(()=>{
      document.getElementById('table-wrap').innerHTML='<div class="empty">데이터베이스 연결 오류<br>npm start 를 먼저 실행해 DB를 초기화하세요.</div>';
    });
  </script>
</body>
</html>`);
});

app.get('/api/companies', (_req, res) => {
  try {
    const companies = getAllCompanies();
    res.json({ companies });
  } catch {
    res.json({ companies: [] });
  }
});

app.listen(PORT, () => {
  console.log(`기업회생정보 대시보드: http://localhost:${PORT}`);
});
