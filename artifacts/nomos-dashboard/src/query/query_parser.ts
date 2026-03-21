/**
 * query_parser.ts  (browser-side)
 *
 * Browser-compatible wrapper for the NOMOS hybrid query parser.
 * Calls the API-server parse endpoint instead of running Node.js / OpenAI directly.
 *
 * Constitutional role:
 * - Extraction only. Does not assign lawfulness.
 * - Implements the same interface as the server-side HybridNomosQueryParser
 *   so QueryBuilderPage can swap between them without contract changes.
 */

import { NomosQuery } from "./query_types";
import { parseQuery } from "./query_api";

export interface HybridQueryParserInput {
  rawInput: string;
  operatorHints?: string[];
  allowFallback?: boolean;
}

export class HybridNomosQueryParser {
  public async parse(input: HybridQueryParserInput): Promise<NomosQuery> {
    return parseQuery(input.rawInput, input.operatorHints);
  }
}
