/**
 * Fields sub-pattern class (5 variants).
 * Containers that primarily display individual fields.
 * https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/user-interface/fields-field-groups-subpattern
 */

import type { SubPatternSpec } from '../../types.js';
import { INPUT_CONTROL_TYPES } from '../../types.js';

export const fieldsFieldGroups: SubPatternSpec = {
  id: 'FieldsFieldGroups',
  xmlName: 'FieldsFieldGroups',
  displayName: 'Fields and Field Groups',
  versions: ['1.1', '1.0'],
  appliesToControlTypes: ['Group', 'TabPage'],
  purpose:
    'Responsive column layout for containers that contain only fields and one level of field groups. ' +
    'The pattern sets WidthMode/HeightMode to SizeToContent — manual widths and SizeToAvailable are not allowed.',
  referenceForms: ['InventLocation (LocationNames)', 'CustTable (FastTabs pages)'],
  root: [
    {
      id: 'FieldGroup',
      controlTypes: ['Group'],
      occurrence: 'zeroOrMore',
      // Only one level of group depth is allowed — nested groups are rejected
      extraChildren: INPUT_CONTROL_TYPES,
    },
  ],
  extraRootChildren: [...INPUT_CONTROL_TYPES],
  notes: [
    'Static text and images are NOT allowed (use HelpText or form-level help instead).',
    'More than one level of group nesting is not allowed.',
  ],
};

export const tabularFields: SubPatternSpec = {
  id: 'TabularFields',
  xmlName: 'TabularFields',
  displayName: 'Tabular Fields',
  versions: ['1.0'],
  appliesToControlTypes: ['Group', 'TabPage'],
  purpose: 'Structured grid-like layout of fields, intended primarily for totals.',
  referenceForms: ['LedgerJournalTransVendPaym (Balances)'],
  root: [],
  extraRootChildren: 'any',
};

export const fillText: SubPatternSpec = {
  id: 'FillText',
  xmlName: 'FillText',
  displayName: 'Fill Text',
  versions: ['1.0'],
  appliesToControlTypes: ['Group', 'TabPage'],
  purpose: 'A single input control that requires full container width (e.g. notes).',
  referenceForms: ['FmRental (Notes)'],
  root: [
    {
      id: 'FullWidthField',
      controlTypes: ['String', 'MultilineText'],
      occurrence: 'required',
    },
  ],
  extraRootChildren: 'none',
};

export const horizontalFieldsButtonGroup: SubPatternSpec = {
  id: 'HorizontalFieldsButtonGroup',
  xmlName: 'HorizontalFieldsButtonGroup',
  xmlAliases: ['HorizontalFieldsAndButtonGroup', 'FieldsAndButtonGroup'],
  displayName: 'Horizontal Fields and Button Group',
  versions: ['1.0'],
  appliesToControlTypes: ['Group'],
  purpose: 'A field (or few fields) with an inline action button on the same row.',
  referenceForms: ['SalesTable (GroupHeaderAddressHeaderOverview)'],
  root: [],
  extraRootChildren: 'any',
  notes: ['xmlName to be confirmed by mining.'],
};

export const imagePreview: SubPatternSpec = {
  id: 'ImagePreview',
  xmlName: 'ImagePreview',
  displayName: 'Image Preview',
  versions: ['1.0'],
  appliesToControlTypes: ['Group', 'TabPage'],
  purpose: 'Container with an image control and optional related fields.',
  referenceForms: ['RetailVisualProfile (Login)'],
  root: [
    { id: 'Image', controlTypes: ['Image'], occurrence: 'required' },
  ],
  extraRootChildren: 'any',
  notes: ['xmlName to be confirmed by mining.'],
};

export const fieldsSubPatterns: SubPatternSpec[] = [
  fieldsFieldGroups,
  tabularFields,
  fillText,
  horizontalFieldsButtonGroup,
  imagePreview,
];
