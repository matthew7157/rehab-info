/**
 * HTML 리포트 생성 및 브라우저 자동 열기
 * 사용법: node report.js
 */
import { buildReport } from './src/reportBuilder.js';
import { exec } from 'child_process';

const today   = new Date().toISOString().slice(0, 10);
const outPath = `rehab_report_${today}.html`;

buildReport(outPath);
console.log(`HTML 리포트 생성: ${outPath}`);

exec(`start "" "${process.cwd()}\\${outPath}"`);
console.log('브라우저에서 열었습니다.');
