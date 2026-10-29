import 'server-only';
import {neon} from '@neondatabase/serverless';
import {requiredEnv} from './env';
export function db(){return neon(requiredEnv('DATABASE_URL'))}
