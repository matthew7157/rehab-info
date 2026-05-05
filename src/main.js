import { initDb, upsertCompany, insertNews, getCompaniesWithoutNews } from './db/database.js';
import { collectAll as collectCourt } from './collectors/courtCollector.js';
import { collectNewsForCompanies } from './collectors/newsCollector.js';
import { enrichIndustry } from './collectors/industryCollector.js';
import { sendDailyReport } from './mailer.js';
import { MAX_PAGES } from './config.js';

export async function runPipeline() {
  console.log('=== 수집 파이프라인 시작 ===');
  initDb();

  // 1. 법원 공고
  console.log('\n[1단계] 법원 공고 수집');
  const courtItems = await collectCourt(MAX_PAGES);
  let newCount = 0;
  for (const item of courtItems) {
    const { isNew } = upsertCompany(item);
    if (isNew) newCount++;
  }
  console.log(`  → ${courtItems.length}건 처리 (신규 ${newCount}건)`);

  // 2. 업종 보완
  console.log('\n[2단계] 업종 정보 수집');
  await enrichIndustry();

  // 3. 뉴스
  console.log('\n[3단계] 관련 뉴스 수집');
  const targets = getCompaniesWithoutNews();
  if (targets.length) {
    const newsMap = await collectNewsForCompanies(targets);
    let total = 0;
    for (const [companyId, articles] of Object.entries(newsMap)) {
      for (const article of articles) insertNews(Number(companyId), article);
      total += articles.length;
    }
    console.log(`  → ${total}건 저장`);
  } else {
    console.log('  → 신규 기업 없음');
  }

  // 4. 결과 메일 발송
  console.log('\n[4단계] 결과 메일 발송');
  try {
    await sendDailyReport(newCount);
  } catch (e) {
    console.error('  [메일 오류]', e.message);
  }

  console.log('\n=== 파이프라인 완료 ===');
}

// 직접 실행 시 (import로 사용될 때는 자동 실행 안 함)
const isMain = process.argv[1]?.endsWith('main.js');
if (isMain) runPipeline().catch(e => { console.error(e); process.exit(1); });
