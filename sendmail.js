/**
 * 기업회생 수집 데이터 이메일 발송
 *
 * 사용법: node sendmail.js
 *
 * .env 에 아래 항목 필요:
 *   EMAIL_FROM     발신 이메일 주소
 *   EMAIL_PASS     발신 계정 비밀번호 (Gmail은 앱 비밀번호)
 *   EMAIL_TO       수신 이메일 주소 (기본: matthew71737@hanmail.net)
 */

import nodemailer from 'nodemailer';
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, existsSync, unlinkSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// .env 로드
const require2 = createRequire(import.meta.url);
const dotenv = await import('dotenv');
dotenv.default.config();

const DB_PATH  = './data/rehab.db';
const TO_EMAIL = process.env.EMAIL_TO || 'matthew71737@hanmail.net';
const FROM_EMAIL = process.env.EMAIL_FROM;
const FROM_PASS  = process.env.EMAIL_PASS;

if (!FROM_EMAIL || !FROM_PASS) {
  console.error('❌ .env 에 EMAIL_FROM 과 EMAIL_PASS 를 설정하세요.');
  console.error('   Gmail 사용 시 → https://myaccount.google.com/apppasswords');
  process.exit(1);
}

if (!existsSync(DB_PATH)) {
  console.error('DB 없음. node src/main.js 로 먼저 수집하세요.');
  process.exit(1);
}

// ─── CSV 생성 ─────────────────────────────────────────────────

function makeCsv() {
  const db = new DatabaseSync(DB_PATH);
  const rows = db.prepare(`
    SELECT c.name, c.case_number, c.application_date, c.court, c.industry,
           c.collected_at, COUNT(n.id) AS news_count
    FROM companies c
    LEFT JOIN news n ON n.company_id = c.id
    GROUP BY c.id
    ORDER BY c.application_date DESC NULLS LAST
  `).all();

  const total   = rows.length;
  const noInds  = rows.filter(r => !r.industry).length;
  const newsSum = db.prepare('SELECT COUNT(*) AS n FROM news').get().n;

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

  const today = new Date().toISOString().slice(0, 10);
  const path  = `companies_${today}.csv`;
  writeFileSync(path, '﻿' + header + body, 'utf-8');

  return { path, total, noInds, newsSum, today };
}

// ─── 통계 텍스트 ──────────────────────────────────────────────

function makeStats(db) {
  const courts = db.prepare(`
    SELECT court, COUNT(*) n FROM companies
    GROUP BY court ORDER BY n DESC LIMIT 10
  `).all();

  const monthly = db.prepare(`
    SELECT substr(application_date,1,7) ym, COUNT(*) n
    FROM companies WHERE application_date IS NOT NULL
    GROUP BY ym ORDER BY ym DESC LIMIT 6
  `).all();

  const courtText   = courts.map(r => `  ${(r.court||'미상').padEnd(16)} ${r.n}건`).join('\n');
  const monthlyText = monthly.map(r => `  ${r.ym}  ${r.n}건`).join('\n');

  return { courtText, monthlyText };
}

// ─── 이메일 발송 ──────────────────────────────────────────────

async function send() {
  const { path, total, noInds, newsSum, today } = makeCsv();
  const db = new DatabaseSync(DB_PATH);
  const { courtText, monthlyText } = makeStats(db);

  // 발신 계정 도메인으로 SMTP 자동 설정
  const domain = FROM_EMAIL.split('@')[1]?.toLowerCase();
  let transportCfg;

  if (domain === 'gmail.com') {
    transportCfg = { service: 'gmail', auth: { user: FROM_EMAIL, pass: FROM_PASS } };
  } else if (domain === 'naver.com') {
    transportCfg = { host: 'smtp.naver.com', port: 465, secure: true, auth: { user: FROM_EMAIL, pass: FROM_PASS } };
  } else if (domain === 'daum.net' || domain === 'hanmail.net' || domain === 'kakao.com') {
    transportCfg = { host: 'smtp.daum.net', port: 465, secure: true, auth: { user: FROM_EMAIL, pass: FROM_PASS } };
  } else {
    // 범용
    transportCfg = { host: `smtp.${domain}`, port: 587, secure: false, auth: { user: FROM_EMAIL, pass: FROM_PASS } };
  }

  const transporter = nodemailer.createTransport(transportCfg);

  const html = `
<h2>기업회생 수집 현황 (${today})</h2>
<table border="1" cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
  <tr><th>항목</th><th>수치</th></tr>
  <tr><td>수집 기업 수</td><td><b>${total}건</b></td></tr>
  <tr><td>업종 미처리</td><td>${noInds}건</td></tr>
  <tr><td>수집 뉴스 수</td><td>${newsSum}건</td></tr>
</table>

<h3>법원별</h3>
<pre>${courtText}</pre>

<h3>월별 신청 건수</h3>
<pre>${monthlyText}</pre>

<p style="color:#888;font-size:12px">첨부 CSV를 엑셀에서 열어 확인하세요.</p>
`;

  const info = await transporter.sendMail({
    from: `"기업회생 수집봇" <${FROM_EMAIL}>`,
    to:   TO_EMAIL,
    subject: `[기업회생] ${today} 수집 결과 (${total}건)`,
    html,
    attachments: [{ filename: path, path }],
  });

  console.log(`✅ 발송 완료 → ${TO_EMAIL}`);
  console.log(`   MessageId: ${info.messageId}`);

  // 임시 CSV 파일 삭제
  try { unlinkSync(path); } catch {}
}

send().catch(e => {
  console.error('❌ 발송 실패:', e.message);
  process.exit(1);
});
