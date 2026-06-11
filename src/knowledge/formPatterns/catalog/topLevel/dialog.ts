/**
 * Dialog form pattern class (6 variants) + Drop Dialog class (2 variants).
 * https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/user-interface/dialog-form-pattern
 * https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/user-interface/drop-dialog-form-pattern
 */

import type { FormPatternSpec, NodeSpec } from '../../types.js';

const dialogBody: NodeSpec = {
  id: 'DialogBody',
  controlTypes: ['Group'],
  occurrence: 'required',
  nameHint: 'DialogBody',
  properties: { Style: 'DialogContent' },
  requiresSubPattern: true,
  allowedSubPatterns: ['FieldsFieldGroups', 'TabularFields', 'FillText'],
  extraChildren: 'any',
};

const commitButtons: NodeSpec = {
  id: 'CommitButtonGroup',
  controlTypes: ['ButtonGroup'],
  occurrence: 'required',
  nameHint: 'ButtonGroup',
  properties: { Style: 'DialogCommitContainer' },
  children: [
    {
      id: 'CommitButton',
      controlTypes: ['CommandButton', 'Button', 'MenuItemButton'],
      occurrence: 'oneOrMore',
    },
  ],
  extraChildren: 'any',
};

export const dialogBasic: FormPatternSpec = {
  id: 'Dialog',
  xmlName: 'Dialog',
  displayName: 'Dialog - Basic',
  versions: ['1.2', '1.1', '1.0'],
  purpose:
    'Modal dialog that gathers or shows a small set of information, committed with OK/Cancel.',
  whenToUse: [
    'Gather a set of inputs before running an action',
    'Quick-create scenarios with a handful of fields',
  ],
  whenNotToUse: [
    'Fewer than ~5 fields attached to a button → Drop Dialog',
    'Content grouped into FastTabs/tabs → Dialog FastTabs/Tabs variants',
    'Read-only info → Dialog - Read Only',
  ],
  referenceForms: ['ProjTableCreate', 'CustOpenBalance'],
  designProperties: { Style: 'Dialog' },
  requiresDataSource: 'none',
  root: [dialogBody, commitButtons],
  extraRootChildren: 'none',
  lifecycleGuidance: [
    'Override form init() to read caller args (element.args()) and default field values.',
    'Override the OK command button clicked() to validate and apply the action.',
    'For quick-create dialogs bind a datasource and override its initValue().',
  ],
};

export const dropDialog: FormPatternSpec = {
  id: 'DropDialog',
  xmlName: 'DropDialog',
  variantOf: 'Dialog',
  displayName: 'Drop Dialog',
  versions: ['1.1', '1.0'],
  purpose:
    'Lightweight dialog dropped from a button to gather a small set of inputs (<5 fields) ' +
    'that provide context for an action.',
  whenToUse: ['Action confirmation/parameters with fewer than ~5 fields, anchored to a button'],
  referenceForms: ['CustCollectionsNewActivityAction', 'SalesEstimates'],
  designProperties: { Style: 'DropDialog' },
  requiresDataSource: 'none',
  root: [
    {
      id: 'DialogBody',
      controlTypes: ['Group'],
      occurrence: 'required',
      requiresSubPattern: true,
      allowedSubPatterns: ['FieldsFieldGroups', 'TabularFields', 'FillText'],
      extraChildren: 'any',
    },
    commitButtons,
  ],
  extraRootChildren: 'none',
};
