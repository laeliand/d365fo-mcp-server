/**
 * Table of Contents form pattern.
 * https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/user-interface/table-of-contents-form-pattern
 */

import type { FormPatternSpec } from '../../types.js';
import { actionPane } from './common.js';

export const tableOfContents: FormPatternSpec = {
  id: 'TableOfContents',
  xmlName: 'TableOfContents',
  displayName: 'Table of Contents',
  versions: ['1.1', '1.0'],
  purpose:
    'Displays setup/parameters information or loosely related information sets as a vertical ' +
    'table-of-contents navigation with one content region per entry.',
  whenToUse: [
    'Module parameters forms (e.g. CustParameters)',
    'Loosely related groups of setup fields navigated from a vertical list',
  ],
  whenNotToUse: ['A single simple entity → Simple List', 'A complex entity → Details Master'],
  referenceForms: ['CustParameters', 'VendParameters', 'BankParameters'],
  designProperties: { Style: 'TableOfContents' },
  requiresDataSource: 'one',
  root: [
    actionPane('optional'),
    {
      id: 'TOCTabs',
      controlTypes: ['Tab'],
      occurrence: 'required',
      properties: { Style: 'TOCList' },
      children: [
        {
          id: 'TOCSection',
          controlTypes: ['TabPage'],
          occurrence: 'oneOrMore',
          requiresSubPattern: true,
          allowedSubPatterns: [
            'FieldsFieldGroups',
            'TabularFields',
            'FillText',
            'ToolbarAndList',
            'ToolbarAndFields',
            'NestedSimpleListDetails',
          ],
          extraChildren: 'any',
        },
      ],
      extraChildren: 'none',
    },
  ],
  extraRootChildren: 'none',
  lifecycleGuidance: [
    'Parameters forms typically use a single-record datasource with InsertIfEmpty=Yes.',
    'Override form init() + datasource executeQuery() when sections load related tables.',
  ],
};
