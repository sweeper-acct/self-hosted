import { describe, it, expect } from 'vitest'
import { getDisplayStatus, FLAGGED_CONFIDENCE_THRESHOLD } from './workpaper-utils'

describe('getDisplayStatus', () => {
  it('returns Inferred when confidence is at the threshold boundary', () => {
    expect(getDisplayStatus('Inferred', FLAGGED_CONFIDENCE_THRESHOLD)).toBe('Inferred')
  })

  it('returns Inferred when confidence is above the threshold', () => {
    expect(getDisplayStatus('Inferred', FLAGGED_CONFIDENCE_THRESHOLD + 0.01)).toBe('Inferred')
    expect(getDisplayStatus('Inferred', 0.95)).toBe('Inferred')
    expect(getDisplayStatus('Inferred', 1.0)).toBe('Inferred')
  })

  it('returns Inferred · Low Confidence when confidence is just below the threshold', () => {
    expect(getDisplayStatus('Inferred', FLAGGED_CONFIDENCE_THRESHOLD - 0.001)).toBe('Inferred · Low Confidence')
  })

  it('returns Inferred · Low Confidence when confidence is well below the threshold', () => {
    expect(getDisplayStatus('Inferred', 0.40)).toBe('Inferred · Low Confidence')
    expect(getDisplayStatus('Inferred', 0.0)).toBe('Inferred · Low Confidence')
  })

  it('does not modify Excluded regardless of confidence', () => {
    expect(getDisplayStatus('Excluded', 0.40)).toBe('Excluded')
    expect(getDisplayStatus('Excluded', 0.95)).toBe('Excluded')
  })

  it('does not modify Review Required regardless of confidence', () => {
    expect(getDisplayStatus('Review Required', 0.40)).toBe('Review Required')
    expect(getDisplayStatus('Review Required', 0.95)).toBe('Review Required')
  })
})
