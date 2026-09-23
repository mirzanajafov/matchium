import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EngineQuestion } from './belief.js';

export interface ContractQuestion extends EngineQuestion {
  text: string;
}

export interface QuestionContract {
  dimensions: string[];
  questions: ContractQuestion[];
}

export function contractPath(name: string): string {
  return fileURLToPath(new URL(`../../../contract/${name}`, import.meta.url));
}

export function readContract<T>(name: string): T {
  return JSON.parse(readFileSync(contractPath(name), 'utf8')) as T;
}
