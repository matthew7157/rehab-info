import 'dotenv/config';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

export const NAVER_CLIENT_ID     = process.env.NAVER_CLIENT_ID     || '';
export const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '';
export const DART_API_KEY        = process.env.DART_API_KEY        || '';
export const MAX_PAGES           = parseInt(process.env.MAX_PAGES  || '10');
export const SCHEDULE_HOUR       = process.env.SCHEDULE_HOUR       || '9';
export const SCHEDULE_MINUTE     = process.env.SCHEDULE_MINUTE     || '0';
export const DB_PATH             = join(__dir, '..', 'data', 'rehab.db');
export const EMAIL_FROM          = process.env.EMAIL_FROM          || '';
export const EMAIL_PASS          = process.env.EMAIL_PASS          || '';
export const EMAIL_TO            = process.env.EMAIL_TO            || 'matthew71737@hanmail.net';
