// Confidence threshold below which a row is flagged for human review.
// Shared between ValidatePage and getDisplayStatus — matches bookkeeping.py
// extract_bank_statement() "low" band and the CLAUDE.md confidence table.
export const FLAGGED_CONFIDENCE_THRESHOLD = 0.70

/**
 * Returns the display label for a row's review status.
 * Only affects "Inferred" status — low-confidence Inferred rows get a
 * "· Low Confidence" suffix so Sheet 1 readers aren't misled by a green
 * "Inferred" label on a 40%-confidence row.
 * Excluded and Review Required are unaffected.
 */
export function getDisplayStatus(status: string, confidence: number): string {
  if (status === 'Inferred' && confidence < FLAGGED_CONFIDENCE_THRESHOLD) {
    return 'Inferred · Low Confidence'
  }
  return status
}
