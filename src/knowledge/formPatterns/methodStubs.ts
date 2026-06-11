/**
 * Per-pattern FormRun / datasource lifecycle method stubs.
 *
 * Stubs are correct-signature skeletons with super() calls and TODO markers —
 * injected by generate_smart_form when includeMethodStubs=true, and exposed
 * through get_form_pattern_spec as lifecycle guidance.
 */

import { resolvePattern } from './index.js';

export interface MethodStub {
  name: string;
  /** Complete X++ source, 4-space indented, ready for a CDATA block */
  source: string;
}

// ── Form-level stubs ─────────────────────────────────────────────────────────

const FORM_INIT: MethodStub = {
  name: 'init',
  source: `    public void init()
    {
        super();

        // TODO: read caller context, e.g.:
        // if (element.args() && element.args().record())
        // {
        //     ...
        // }
    }`,
};

const FORM_EXECUTE_QUERY = (dsName: string): MethodStub => ({
  name: 'executeQuery',
  source: `    public void executeQuery()
    {
        // TODO: add dynamic ranges before super(), e.g.:
        // SysQuery::findOrCreateRange(${dsName}_ds.queryBuildDataSource(), fieldNum(${dsName}, RecId));

        super();
    }`,
});

const FORM_CLOSE_OK: MethodStub = {
  name: 'closeOk',
  source: `    public void closeOk()
    {
        // TODO: apply the dialog action before the form closes.

        super();
    }`,
};

// ── Datasource-level stubs ───────────────────────────────────────────────────

const DS_INIT_VALUE: MethodStub = {
  name: 'initValue',
  source: `        public void initValue()
        {
            super();

            // TODO: default field values for new records.
        }`,
};

const DS_ACTIVE: MethodStub = {
  name: 'active',
  source: `        public int active()
        {
            int ret = super();

            // TODO: enable/disable controls based on the current record.

            return ret;
        }`,
};

const DS_VALIDATE_WRITE: MethodStub = {
  name: 'validateWrite',
  source: `        public boolean validateWrite()
        {
            boolean ret = super();

            // TODO: cross-field validation before save.

            return ret;
        }`,
};

// ── Per-pattern selection ────────────────────────────────────────────────────

export interface PatternMethodStubs {
  formMethods: MethodStub[];
  /** Stubs for the PRIMARY datasource */
  dataSourceMethods: MethodStub[];
}

/**
 * Lifecycle stubs appropriate for a pattern. `dsName` is the primary
 * datasource name (used inside stub bodies for examples).
 */
export function methodStubsForPattern(patternName: string, dsName: string): PatternMethodStubs {
  const spec = resolvePattern(patternName);
  const id = spec?.id ?? 'SimpleList';

  switch (id) {
    case 'Dialog':
    case 'DropDialog':
      return {
        formMethods: [FORM_INIT, FORM_CLOSE_OK],
        dataSourceMethods: dsName ? [DS_INIT_VALUE] : [],
      };
    case 'Lookup':
      return {
        formMethods: [FORM_INIT, FORM_EXECUTE_QUERY(dsName)],
        dataSourceMethods: [],
      };
    case 'DetailsMaster':
    case 'DetailsMasterTabs':
      return {
        formMethods: [FORM_INIT],
        dataSourceMethods: [DS_ACTIVE, DS_VALIDATE_WRITE],
      };
    case 'DetailsTransaction':
      return {
        formMethods: [FORM_INIT],
        dataSourceMethods: [DS_ACTIVE, DS_INIT_VALUE, DS_VALIDATE_WRITE],
      };
    case 'SimpleListDetails':
      return {
        formMethods: [],
        dataSourceMethods: [DS_ACTIVE, DS_INIT_VALUE],
      };
    case 'Workspace':
    case 'WorkspaceOperational':
      return { formMethods: [FORM_INIT], dataSourceMethods: [] };
    case 'SimpleList':
    case 'ListPage':
    case 'TableOfContents':
    default:
      return {
        formMethods: [],
        dataSourceMethods: dsName ? [DS_INIT_VALUE, DS_VALIDATE_WRITE] : [],
      };
  }
}

// ── String-level injection into AxForm XML ───────────────────────────────────

function methodXml(stub: MethodStub, indent: string): string {
  return (
    `${indent}<Method>\n` +
    `${indent}\t<Name>${stub.name}</Name>\n` +
    `${indent}\t<Source><![CDATA[\n${stub.source}\n]]></Source>\n` +
    `${indent}</Method>\n`
  );
}

/**
 * Inject method stubs into AxForm XML (string-level, format-preserving):
 *  - form methods: appended after the classDeclaration </Method> inside
 *    SourceCode > Methods
 *  - datasource methods: inserted as a <Methods> block right after the
 *    primary AxFormDataSource's <Name> (merged when one already exists)
 *
 * Returns the new XML and the names of injected methods.
 */
export function injectMethodStubs(
  xml: string,
  stubs: PatternMethodStubs,
  dsName: string,
): { xml: string; injected: string[] } {
  let result = xml;
  const injected: string[] = [];

  if (stubs.formMethods.length > 0) {
    // classDeclaration method block ends at the first </Method> after its <Name>
    const cdIdx = result.indexOf('<Name>classDeclaration</Name>');
    const closeIdx = cdIdx === -1 ? -1 : result.indexOf('</Method>', cdIdx);
    if (closeIdx !== -1) {
      const insertAt = closeIdx + '</Method>'.length;
      const block = stubs.formMethods
        .map((s) => `\n\t\t\t<Method>\n\t\t\t\t<Name>${s.name}</Name>\n\t\t\t\t<Source><![CDATA[\n${s.source}\n]]></Source>\n\t\t\t</Method>`)
        .join('');
      result = result.slice(0, insertAt) + block + result.slice(insertAt);
      injected.push(...stubs.formMethods.map((s) => s.name));
    }
  }

  if (stubs.dataSourceMethods.length > 0 && dsName) {
    // Primary datasource: first <AxFormDataSource …><Name>dsName</Name>
    const dsOpen = result.indexOf('<AxFormDataSource');
    const nameTag = `<Name>${dsName}</Name>`;
    const nameIdx = dsOpen === -1 ? -1 : result.indexOf(nameTag, dsOpen);
    if (nameIdx !== -1) {
      const insertAt = nameIdx + nameTag.length;
      const methodsBlock =
        `\n\t\t\t<Methods>\n` +
        stubs.dataSourceMethods.map((s) => methodXml(s, '\t\t\t\t')).join('') +
        `\t\t\t</Methods>`;
      result = result.slice(0, insertAt) + methodsBlock + result.slice(insertAt);
      injected.push(...stubs.dataSourceMethods.map((s) => `${dsName}.${s.name}`));
    }
  }

  return { xml: result, injected };
}
