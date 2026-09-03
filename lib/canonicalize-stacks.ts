import { GoogleGenAI } from "@google/genai";
import { KEYWORD_DICTIONARY } from "./keyword-dictionary";

const EMBEDDING_MODEL = "gemini-embedding-001";
// 실측 보정: 사전에 없는 표기 변형(예: "react-native")은 0.82~0.97, 서로 다른
// 기술(예: Java vs JavaScript, MySQL vs PostgreSQL)은 0.56~0.76로 나와 0.8
// 근처에서 깨끗하게 갈림 — 애매한 경우엔 미등록으로 남기는 쪽(암묵지 2번 원칙)이
// 안전하므로 여유를 두고 0.8로 설정
const SIMILARITY_THRESHOLD = 0.8;

interface DictTerm {
  text: string;
  canonical: string;
}

export interface CanonicalizedStack {
  raw: string;
  canonical: string | null;
  registered: boolean;
}

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildExactMatchIndex(): Map<string, string> {
  const index = new Map<string, string>();
  for (const entry of KEYWORD_DICTIONARY) {
    index.set(normalize(entry.canonical), entry.canonical);
    for (const synonym of entry.synonyms) index.set(normalize(synonym), entry.canonical);
  }
  return index;
}

// 임베딩 유사도 검색(폴백 경로)은 표준명만 대상으로 한다 — 동의어는 이미 위
// exactMatchIndex가 무료로 잡아내므로, 매 요청마다 무료 티어 임베딩 할당량을
// 아끼기 위해 사전 항목 수(~90개)가 아닌 표준명 수(~55개)만 임베딩한다
function buildCanonicalTerms(): DictTerm[] {
  return KEYWORD_DICTIONARY.map((entry) => ({
    text: entry.canonical,
    canonical: entry.canonical,
  }));
}

async function embedTexts(ai: GoogleGenAI, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts,
  });
  return (response.embeddings ?? []).map((embedding) => embedding.values ?? []);
}

// 무료 티어의 embedContent 분당 요청 한도가 낮아, 정적 사전(~70개 항목)을 매
// 요청마다 다시 임베딩하면 금방 소진된다. 웜 서버 인스턴스가 살아있는 동안엔
// 재사용하고, 콜드 스타트되면 다시 즉석 생성됨 — DB/파일 영구 저장은 아니므로
// 하드 룰 6번("세션마다 즉석 생성, 영구 저장 금지")과 상충하지 않음
let cachedDictEmbeddings: Promise<number[][]> | null = null;

function getDictEmbeddings(ai: GoogleGenAI, dictTerms: DictTerm[]): Promise<number[][]> {
  if (!cachedDictEmbeddings) {
    cachedDictEmbeddings = embedTexts(ai, dictTerms.map((t) => t.text)).catch((err) => {
      cachedDictEmbeddings = null;
      throw err;
    });
  }
  return cachedDictEmbeddings;
}

export async function canonicalizeStacks(
  rawStacks: string[]
): Promise<CanonicalizedStack[]> {
  if (rawStacks.length === 0) return [];

  const exactMatchIndex = buildExactMatchIndex();

  const results = new Array<CanonicalizedStack>(rawStacks.length);
  const unmatchedIndices: number[] = [];

  rawStacks.forEach((raw, i) => {
    const exactMatch = exactMatchIndex.get(normalize(raw));
    if (exactMatch) {
      results[i] = { raw, canonical: exactMatch, registered: true };
    } else {
      unmatchedIndices.push(i);
    }
  });

  if (unmatchedIndices.length === 0) return results;

  const canonicalTerms = buildCanonicalTerms();
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const [dictEmbeddings, rawEmbeddings] = await Promise.all([
    getDictEmbeddings(ai, canonicalTerms),
    embedTexts(ai, unmatchedIndices.map((i) => rawStacks[i])),
  ]);

  unmatchedIndices.forEach((rawIndex, embeddingIndex) => {
    const rawVector = rawEmbeddings[embeddingIndex];
    let best = { canonical: null as string | null, score: -Infinity };
    dictEmbeddings.forEach((dictVector, dictIndex) => {
      const score = cosineSimilarity(rawVector, dictVector);
      if (score > best.score) {
        best = { canonical: canonicalTerms[dictIndex].canonical, score };
      }
    });

    const registered = best.score >= SIMILARITY_THRESHOLD;
    results[rawIndex] = {
      raw: rawStacks[rawIndex],
      canonical: registered ? best.canonical : null,
      registered,
    };
  });

  return results;
}
