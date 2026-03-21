/**
 * relation_binder.ts
 *
 * Core relation-binding layer for the NOMOS measurement-and-relation grammar.
 *
 * Takes raw text, extracts all measured entities and relation words, then
 * produces RelationBinding records that connect entities / anchors through
 * temporal, spatial, and quantitative relations.
 *
 * Open-vocabulary: entity labels and anchor nouns are never restricted to a
 * closed dictionary.  Only units and relation words are closed-registry.
 *
 * This layer runs before domain-family routing.
 *
 * Binding algorithm (per relation occurrence):
 *
 *   Text layout:   [subject_entity] [offset_entity?] [RELATION] [object_or_anchor]
 *
 *   Left side  — entities whose endIndex <= relation.startIndex
 *     • If 2+ entities and the LAST is a time/distance unit → that is the
 *       temporal/spatial offset; the entity before it is the subject.
 *     • Otherwise the last entity is the subject (no offset).
 *
 *   Right side — text after relation.endIndex
 *     • If a measured entity starts immediately after the relation (only
 *       whitespace between) → it is the object entity (e.g. "for 12 reps").
 *     • Otherwise → extract an open-vocabulary anchor noun phrase
 *       (strips leading articles, takes up to 3 word tokens).
 */

import {
  extractMeasuredEntities,
  resetEntityCounter,
} from "./measured_entity_extractor.ts";
import { findRelationMatches }        from "./relation_lexicon.ts";
import { resolveAnchor, KNOWN_ANCHOR_ALIASES } from "./anchor_registry.ts";
import type { MeasuredEntitySpan }    from "./measured_entity_types.ts";
import type {
  BindingResult,
  RelationBinding,
  AnchorReference,
} from "./measured_entity_types.ts";

/* =========================================================
   Anchor phrase extraction  (open-vocabulary)
   ========================================================= */

const LEADING_ARTICLES = /^(the|a|an)\s+/i;

/**
 * Extract a noun-phrase anchor from text that follows a relation word.
 * Strips leading articles; takes up to 3 word tokens.
 */
function extractAnchorPhrase(textAfterRelation: string): string {
  const trimmed = textAfterRelation.trimStart().replace(LEADING_ARTICLES, "");
  const tokens  = trimmed.match(/[a-z][a-z-]*/gi) ?? [];
  return tokens.slice(0, 3).join(" ").toLowerCase().trim();
}

/* =========================================================
   Offset detection
   ========================================================= */

/**
 * True when an entity is a temporal or spatial offset (time / distance unit).
 * These entities sit BETWEEN the primary subject and a relation word and
 * describe *how far* the subject is from the anchor.
 */
function isOffsetUnit(entity: MeasuredEntitySpan): boolean {
  return entity.unitCategory === "time" || entity.unitCategory === "distance";
}

/* =========================================================
   Immediate adjacency check
   ========================================================= */

/**
 * True when the text between `relEnd` and `candidateStart` is only whitespace.
 * Used to distinguish "for 12 reps" (adjacent entity) from "for dinner" (anchor).
 */
function isImmediatelyAfter(
  rawText: string,
  relEnd: number,
  candidateStart: number
): boolean {
  if (candidateStart < relEnd) return false;
  return rawText.slice(relEnd, candidateStart).trim() === "";
}

/* =========================================================
   Public API
   ========================================================= */

/**
 * Parse `rawText` into a BindingResult containing:
 *   - All measured entities (position-aware)
 *   - All anchor references (known + open-vocabulary)
 *   - All relation bindings connecting entities / anchors
 */
export function bindRelations(rawText: string): BindingResult {
  resetEntityCounter();

  const entities = extractMeasuredEntities(rawText);
  const relations = findRelationMatches(rawText);

  const anchors: AnchorReference[] = [];
  const bindings: RelationBinding[] = [];

  let anchorIndex   = 0;
  let bindingIndex  = 0;

  // Index entities by id for quick lookup
  const entityById = new Map<string, MeasuredEntitySpan>(
    entities.map((e) => [e.id, e])
  );

  for (const rel of relations) {
    // ── Left side: entities that end at or before the relation word ─────────
    const leftEntities  = entities.filter((e) => e.endIndex <= rel.startIndex);
    const rightEntitiesAll = entities.filter(
      (e) => e.startIndex >= rel.endIndex &&
             isImmediatelyAfter(rawText, rel.endIndex, e.startIndex)
    );

    /**
     * Quantitative threshold relations (at least, no more than, etc.) read
     * as  [RELATION] [ENTITY]  — the entity is on the RIGHT side with
     * nothing to their left.  Handle that case first.
     */
    if (leftEntities.length === 0 && rel.category === "quantitative") {
      if (rightEntitiesAll.length === 0) continue;
      const subjectRight = rightEntitiesAll[0];
      const bindingRawText = rawText
        .slice(rel.startIndex, subjectRight.endIndex)
        .replace(/\s+/g, " ")
        .trim();
      bindings.push({
        id:               `rb_${bindingIndex++}`,
        subjectId:        subjectRight.id,
        relation:         rel.canonical,
        relationCategory: rel.category,
        objectId:         null,
        objectIsAnchor:   null,
        offsetAmount:     null,
        offsetUnit:       null,
        rawText:          bindingRawText,
      });
      continue;
    }

    if (leftEntities.length === 0) continue; // no subject and not quantitative → skip

    let subjectEntity: MeasuredEntitySpan;
    let offsetAmount: number | null = null;
    let offsetUnit:   string | null = null;

    if (
      leftEntities.length >= 2 &&
      isOffsetUnit(leftEntities[leftEntities.length - 1])
    ) {
      // Last left entity is a temporal/spatial offset
      const offsetEntity = leftEntities[leftEntities.length - 1];
      subjectEntity = leftEntities[leftEntities.length - 2];
      offsetAmount  = offsetEntity.amount;
      offsetUnit    = offsetEntity.normalizedUnit;
    } else {
      // Single left entity or last entity is not an offset unit
      subjectEntity = leftEntities[leftEntities.length - 1];
    }

    // ── Right side: look for adjacent entity first, then anchor phrase ───────
    // (rightEntitiesAll was already computed at the top of the loop iteration)
    let objectId:      string | null = null;
    let objectIsAnchor: boolean | null = null;

    if (rightEntitiesAll.length > 0) {
      // Right side starts with a measured entity (e.g. "for 12 reps")
      objectId      = rightEntitiesAll[0].id;
      objectIsAnchor = false;
    } else {
      // Right side is an anchor noun phrase (open-vocabulary)
      const rightText = rawText.slice(rel.endIndex);
      const anchorLabel = extractAnchorPhrase(rightText);

      if (anchorLabel !== "") {
        const knownRecord    = resolveAnchor(anchorLabel.split(" ")[0]);
        const isKnownAnchor  = !!knownRecord ||
          KNOWN_ANCHOR_ALIASES.has(anchorLabel.split(" ")[0].toLowerCase());

        const anchor: AnchorReference = {
          id:            `anc_${anchorIndex++}`,
          label:         knownRecord?.canonical ?? anchorLabel,
          isKnownAnchor,
          rawText:       rawText.slice(rel.endIndex).trimStart().split(/\n/)[0].trim(),
        };
        anchors.push(anchor);
        objectId      = anchor.id;
        objectIsAnchor = true;
      }
    }

    // ── Raw text slice covering the full binding ──────────────────────────────
    const bindingStart  = subjectEntity.startIndex;
    const bindingEnd    = objectIsAnchor === false && objectId !== null
      ? (entityById.get(objectId)?.endIndex ?? rel.endIndex)
      : rel.endIndex + Math.min(40, rawText.length - rel.endIndex);

    const bindingRawText = rawText
      .slice(bindingStart, bindingEnd)
      .replace(/\s+/g, " ")
      .trim();

    bindings.push({
      id:               `rb_${bindingIndex++}`,
      subjectId:        subjectEntity.id,
      relation:         rel.canonical,
      relationCategory: rel.category,
      objectId,
      objectIsAnchor,
      offsetAmount,
      offsetUnit,
      rawText:          bindingRawText,
    });
  }

  return { entities, anchors, bindings };
}
