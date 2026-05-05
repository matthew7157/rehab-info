import nodemailer from 'nodemailer';
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, unlinkSync } from 'fs';
import { EMAIL_FROM, EMAIL_PASS, EMAIL_TO, DB_PATH } from './config.js';
import { buildReport } from './reportBuilder.js';

function buildSummary(db, newCount, today) {
  const total    = db.prepare('SELECT COUNT(*) AS n FROM companies').get().n;
  const noInds   = db.prepare("SELECT COUNT(*) AS n FROM companies WHERE industry IS NULL OR industry=''").get().n;
  const newsTotal = db.prepare('SELECT COUNT(*) AS n FROM news').get().n;

  const courts = db.prepare(`
    SELECT court, COUNT(*) n FROM companies GROUP BY court ORDER BY n DESC
  `).all();

  const monthly = db.prepare(`
    SELECT substr(application_date,1,7) ym, COUNT(*) n
    FROM companies WHERE application_date IS NOT NULL
    GROUP BY ym ORDER BY ym DESC LIMIT 6
  `).all();

  const courtRows = courts.map(r => `
    <tr>
      <td style="padding:5px 10px;border-bottom:1px solid #eee">${r.court || '미상'}</td>
      <td style="padding:5px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:bold">${r.n}건</td>
    </tr>`).join('');

  const monthRows = monthly.map(r => `
    <tr>
      <td style="padding:5px 10px;border-bottom:1px solid #eee">${r.ym}</td>
      <td style="padding:5px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:bold">${r.n}건</td>
    </tr>`).join('');

  return `
<div style="font-family:'Malgun Gothic',Arial,sans-serif;background:#fff;border-bottom:3px solid #1a3a5c;padding:20px 24px;margin-bottom:0">

  <!-- 헤더 -->
  <div style="background:#1a3a5c;color:#fff;padding:14px 18px;border-radius:6px;margin-bottom:16px">
    <div style="font-size:17px;font-weight:bold">기업회생 수집 현황 — ${today}</div>
    <div style="font-size:12px;opacity:.8;margin-top:3px">자동 수집 완료 · 아래 표를 스크롤하여 전체 목록을 확인하세요</div>
  </div>

  <!-- 요약 카드 -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
    <tr>
      <td style="width:25%;padding:0 6px 0 0">
        <div style="background:#f0f4ff;border-radius:6px;padding:12px;text-align:center">
          <div style="font-size:26px;font-weight:bold;color:#1a3a5c">${total}</div>
          <div style="font-size:11px;color:#666;margin-top:2px">전체 수집 기업</div>
        </div>
      </td>
      <td style="width:25%;padding:0 6px">
        <div style="background:#fff5f5;border-radius:6px;padding:12px;text-align:center">
          <div style="font-size:26px;font-weight:bold;color:#c0392b">${newCount}</div>
          <div style="font-size:11px;color:#666;margin-top:2px">금일 신규</div>
        </div>
      </td>
      <td style="width:25%;padding:0 6px">
        <div style="background:#f5fff5;border-radius:6px;padding:12px;text-align:center">
          <div style="font-size:26px;font-weight:bold;color:#27ae60">${newsTotal}</div>
          <div style="font-size:11px;color:#666;margin-top:2px">수집 뉴스</div>
        </div>
      </td>
      <td style="width:25%;padding:0 0 0 6px">
        <div style="background:#fffbf0;border-radius:6px;padding:12px;text-align:center">
          <div style="font-size:26px;font-weight:bold;color:#e67e22">${noInds}</div>
          <div style="font-size:11px;color:#666;margin-top:2px">업종 미처리</div>
        </div>
      </td>
    </tr>
  </table>

  <!-- 법원별 / 월별 -->
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="width:55%;vertical-align:top;padding-right:12px">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e0e0;border-radius:6px;overflow:hidden">
          <tr style="background:#1a3a5c">
            <th colspan="2" style="color:#fff;padding:8px 10px;text-align:left;font-size:13px">전국 법원별 건수</th>
          </tr>
          ${courtRows}
        </table>
      </td>
      <td style="width:45%;vertical-align:top">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e0e0;border-radius:6px;overflow:hidden">
          <tr style="background:#1a3a5c">
            <th colspan="2" style="color:#fff;padding:8px 10px;text-align:left;font-size:13px">월별 신청 건수</th>
          </tr>
          ${monthRows}
        </table>
      </td>
    </tr>
  </table>

  <div style="margin-top:12px;padding:8px 12px;background:#f9f9f9;border-radius:4px;font-size:12px;color:#888">
    아래는 전체 기업 목록입니다. 첨부 CSV 파일을 엑셀에서 열어 활용하세요.
  </div>
</div>`;
}

function makeCsv(db, today) {
  const rows = db.prepare(`
    SELECT c.name, c.case_number, c.application_date, c.court, c.industry,
           c.collected_at, COUNT(n.id) AS news_count
    FROM companies c
    LEFT JOIN news n ON n.company_id = c.id
    GROUP BY c.id
    ORDER BY c.application_date DESC NULLS LAST
  `).all();

  const header = '기업명,사건번호,신청일,법원,업종,뉴스건수,수집일시\n';
  const body   = rows.map(r =>
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

  const csvPath = `companies_${today}.csv`;
  writeFileSync(csvPath, '﻿' + header + body, 'utf-8');
  return { csvPath, count: rows.length };
}

function makeTransport() {
  const domain = EMAIL_FROM.split('@')[1]?.toLowerCase();
  if (domain === 'gmail.com')
    return { service: 'gmail', auth: { user: EMAIL_FROM, pass: EMAIL_PASS } };
  if (domain === 'naver.com')
    return { host: 'smtp.naver.com', port: 465, secure: true, auth: { user: EMAIL_FROM, pass: EMAIL_PASS } };
  if (['daum.net','hanmail.net','kakao.com'].includes(domain))
    return { host: 'smtp.daum.net', port: 465, secure: true, auth: { user: EMAIL_FROM, pass: EMAIL_PASS } };
  return { host: `smtp.${domain}`, port: 587, secure: false, auth: { user: EMAIL_FROM, pass: EMAIL_PASS } };
}

export async function sendDailyReport(newCount = 0) {
  if (!EMAIL_FROM || !EMAIL_PASS) {
    console.log('[메일] EMAIL_FROM / EMAIL_PASS 미설정 — 발송 건너뜀');
    return;
  }

  const db    = new DatabaseSync(DB_PATH);
  const today = new Date().toISOString().slice(0, 10);

  // 요약 섹션 + 전체 리포트 HTML 결합
  const { html: reportHtml, total } = buildReport(null);
  const summary = buildSummary(db, newCount, today);

  // <body> 바로 뒤에 요약 삽입
  const emailHtml = reportHtml.replace('<body>', '<body>' + summary);

  // 첨부파일: CSV
  const { csvPath } = makeCsv(db, today);

  const transporter = nodemailer.createTransport(makeTransport());

  await transporter.sendMail({
    from:    `"기업회생 수집봇" <${EMAIL_FROM}>`,
    to:      EMAIL_TO,
    subject: `[기업회생] ${today} 수집 완료 (전체 ${total}건, 신규 ${newCount}건)`,
    html:    emailHtml,
    attachments: [
      { filename: `기업회생_${today}.csv`, path: csvPath },
    ],
  });

  try { unlinkSync(csvPath); } catch {}
  console.log(`[메일] 발송 완료 → ${EMAIL_TO} (전체 ${total}건, 신규 ${newCount}건)`);
}
