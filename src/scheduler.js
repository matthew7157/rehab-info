import cron from 'node-cron';
import { SCHEDULE_HOUR, SCHEDULE_MINUTE } from './config.js';
import { runPipeline } from './main.js';

const expr = `${SCHEDULE_MINUTE} ${SCHEDULE_HOUR} * * *`;

console.log(`스케줄러 시작 — 매일 ${String(SCHEDULE_HOUR).padStart(2,'0')}:${String(SCHEDULE_MINUTE).padStart(2,'0')} KST 실행`);
console.log(`cron 표현식: ${expr}`);

cron.schedule(expr, () => {
  console.log(`\n[${new Date().toLocaleString('ko-KR')}] 정기 수집 시작`);
  runPipeline().catch(e => console.error('파이프라인 오류:', e));
}, { timezone: 'Asia/Seoul' });
