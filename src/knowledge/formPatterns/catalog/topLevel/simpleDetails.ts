/**
 * Simple Details form pattern class (4 variants) — focused on a single record.
 * https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/user-interface/simple-details-form-pattern
 */

import type { FormPatternSpec } from '../../types.js';

export const simpleDetailsToolbarFields: FormPatternSpec = {
  id: 'SimpleDetails',
  xmlName: 'SimpleDetails',
  xmlAliases: ['SimpleDetailsToolbarFields', 'SimpleDetailsWToolbar'],
  displayName: 'Simple Details w/ Toolbar and Fields',
  versions: ['1.1', '1.0'],
  purpose: 'Shows fields for a single base record with an optional toolbar — the default Simple Details variant.',
  whenToUse: [
    'Form focused on ONE record (no grid/list navigation)',
    'A flat set of fields with a toolbar for actions',
  ],
  whenNotToUse: [
    'Fields organized into FastTabs → Simple Details w/ FastTabs',
    'Multiple records → Simple List / Simple List & Details',
  ],
  referenceForms: ['AgreementLine'],
  requiresDataSource: 'one',
  root: [
    {
      id: 'Toolbar',
      controlTypes: ['ActionPane', 'ActionPaneTab'],
      occurrence: 'optional',
      extraChildren: 'any',
    },
    {
      id: 'FieldsBody',
      controlTypes: ['Group', 'Tab'],
      occurrence: 'oneOrMore',
      requiresSubPattern: false,
      extraChildren: 'any',
    },
  ],
  extraRootChildren: 'any',
  lifecycleGuidance: [
    'Override the datasource active()/validateWrite() for record-state logic.',
  ],
  notes: [
    'Variants (FastTabs / Standard Tabs / Panorama) share the Simple Details class; ' +
      'the variant is the body container style. Exact xmlNames to be confirmed by mining.',
  ],
};

export const simpleDetailsPatterns: FormPatternSpec[] = [simpleDetailsToolbarFields];
