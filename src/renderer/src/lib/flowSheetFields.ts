import type { BodyScanFindings, FoundationFindings, Lifestyle } from './types';

// The Appointment Flow Sheet's prompt labels, in the order Nicole reads them on
// the paper sheet. Shared by the review panel and the editor so the two can
// never drift out of order or out of vocabulary — the labels ARE her document.

export const FOUNDATION_FIELDS: { key: keyof FoundationFindings; label: string }[] = [
  { key: 'laying1', label: 'Laying 1 foundations' },
  { key: 'standing', label: 'Standing foundations' },
  { key: 'hta', label: 'HTA' },
  { key: 'hta_post_run', label: 'HTA post run' },
  { key: 'laying2', label: 'Laying 2 foundations' },
  { key: 'art_open', label: 'ART · Open' },
  { key: 'art_switch', label: 'ART · Switch' },
  { key: 'art_cns', label: 'ART · CNS' },
  { key: 'art_dental', label: 'ART · Dental' },
  { key: 'art_hormonal', label: 'ART · Hormonal' },
  { key: 'additional', label: 'Additional' },
];

export const BODY_SCAN_FIELDS: { key: keyof BodyScanFindings; label: string }[] = [
  { key: 'art_ectoderm', label: 'ART w/ pol · Ectoderm' },
  { key: 'art_priority', label: 'ART w/ pol · Priority' },
  { key: 'art_matrix', label: 'ART w/ pol · Matrix' },
  { key: 'art_cell', label: 'ART w/ pol · Cell' },
  { key: 'additional_art', label: 'Additional ART' },
  { key: 'scan_priority', label: 'NRT w/o pol · Priority' },
  { key: 'scan_matrix', label: 'NRT w/o pol · Matrix' },
  { key: 'scan_cell', label: 'NRT w/o pol · Cell' },
  { key: 'additional_nrt', label: 'Additional NRT' },
];

export const LIFESTYLE_FIELDS: { key: keyof Lifestyle; label: string }[] = [
  { key: 'bm', label: 'BM' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'water', label: 'Water' },
  { key: 'cycle', label: 'Cycle' },
  { key: 'exercise', label: 'Exercise' },
  { key: 'diet', label: 'Diet' },
];

export const EMPTY_FOUNDATION: FoundationFindings = {
  laying1: null, standing: null, hta: null, hta_post_run: null, laying2: null,
  art_open: null, art_switch: null, art_cns: null, art_dental: null,
  art_hormonal: null, additional: null,
};

export const EMPTY_BODY_SCAN: BodyScanFindings = {
  art_ectoderm: null, art_priority: null, art_matrix: null, art_cell: null,
  additional_art: null, scan_priority: null, scan_matrix: null, scan_cell: null,
  additional_nrt: null,
};
