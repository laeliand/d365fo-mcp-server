/**
 * Lookup form pattern class (3 variants).
 * https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/user-interface/lookup-form-pattern
 */

import type { FormPatternSpec } from '../../types.js';
import { filterGroup, mainGrid } from './common.js';

export const lookupBasic: FormPatternSpec = {
  id: 'Lookup',
  xmlName: 'Lookup',
  displayName: 'Lookup - Basic',
  versions: ['1.2', '1.1', '1.0'],
  purpose:
    'Form used as a lookup: a grid (or tree) optimized for picking a value, with optional ' +
    'filters or buttons.',
  whenToUse: [
    'Custom lookup replacing the auto-generated one (form name conventionally ends in "Lookup")',
    'Pick-a-value scenarios launched from a control',
  ],
  whenNotToUse: [
    'A record preview is needed → Lookup w/ Preview',
    'Multiple lookup views (grid + tree) → Lookup w/ Tabs',
  ],
  referenceForms: ['SysLanguageLookup', 'HcmWorkerLookup', 'CaseCategoryLookup'],
  designProperties: { Style: 'Lookup' },
  requiresDataSource: 'one',
  root: [filterGroup('optional'), mainGrid('required')],
  // Lookups may add button groups / preview panes around the grid
  extraRootChildren: 'any',
  lifecycleGuidance: [
    'Override form init() to read the calling control via element.args().',
    'Override the datasource executeQuery() to apply context filters from the caller.',
    'Use SysTableLookup/selectMode patterns to return the picked value.',
  ],
};
