import type { ResourceType } from '@/lib/types';

// Kanonische Reihenfolge fuer UI-Listen, Balken und Legenden.
export const RESOURCE_TYPES: readonly ResourceType[] = [
  'notaufnahme',
  'op_saal',
  'its_bett',
  'normal_bett',
] as const;

// Kurz-Labels (Balken, Chips, kompakte Listen).
export const RESOURCE_DISPLAY: Record<ResourceType, string> = {
  notaufnahme: 'Notaufnahme',
  op_saal: 'OP',
  its_bett: 'ITS',
  normal_bett: 'Normal',
};

// Lang-Labels (Tooltips, Klinik-Detail-Panel).
export const RESOURCE_DISPLAY_LONG: Record<ResourceType, string> = {
  notaufnahme: 'Notaufnahme / Schockraum',
  op_saal: 'OP-Saal',
  its_bett: 'Intensivbett',
  normal_bett: 'Normalstation',
};

// Farb-Tokens fuer Balken, Sparklines, Legenden. Zeigen auf CSS-Variablen
// aus app/globals.css (DESIGN.md §1 Chart-Slots). chart-1 bleibt fuer
// "Overall" reserviert, daher normal_bett auf accent-green.
export const RESOURCE_COLOR: Record<ResourceType, string> = {
  notaufnahme: 'var(--chart-4)',
  op_saal: 'var(--chart-3)',
  its_bett: 'var(--chart-2)',
  normal_bett: 'var(--accent-green)',
};
