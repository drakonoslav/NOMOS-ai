/**
 * query_parser.ts
 *
 * Hybrid NOMOS query parser.
 *
 * Attempts LLM extraction first. Falls back to rule-based parser if the
 * OpenAI call fails and allowFallback is true.
 *
 * Constitutional role:
 * - Extraction only. No lawfulness determination.
 */

import { NomosQuery } from "./query_types.js";
import { LLMQueryParser } from "./llm_query_parser.js";
import { NomosQueryParser as RuleBasedParser } from "./query_parser_rule_based.js";

export interface HybridQueryParserInput {
  rawInput: string;
  operatorHints?: string[];
  allowFallback?: boolean;
}

export class HybridNomosQueryParser {
  private llm = new LLMQueryParser();
  private fallback = new RuleBasedParser();

  public async parse(input: HybridQueryParserInput): Promise<NomosQuery> {
    try {
      return await this.llm.parse({
        rawInput: input.rawInput,
        operatorHints: input.operatorHints,
      });
    } catch (err) {
      if (!input.allowFallback) throw err;

      const fallbackResult = this.fallback.parse(input.rawInput);
      return {
        ...fallbackResult,
        notes: [
          ...fallbackResult.notes,
          `LLM parser unavailable; rule-based fallback used. Reason: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ],
      };
    }
  }
}
