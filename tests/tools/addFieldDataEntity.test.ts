/**
 * add-field on a PLAIN data-entity (AxDataEntityView, not an extension).
 *
 * The bug this guards: add-field on a plain data-entity used to fall straight into
 * the table/table-extension field path — a bare bridgeAddField call with no mapped/
 * unmapped binding at all — which the C# bridge resolved by trying
 * Tables.Read()/TableExtensions.Read() only, throwing "Table or table-extension
 * '<name>' not found" even for a real, freshly-indexed AxDataEntityView. A plain
 * data-entity needs its OWN two field shapes, neither of which is an AxTableField:
 *
 *  - dataField + dataSource  → AxDataEntityViewMappedField (same shape the
 *    data-entity-EXTENSION path already had, just on AxDataEntityView.Fields).
 *  - neither                 → AxDataEntityViewUnmappedField* (a virtual column —
 *    fieldType/fieldBaseType or fieldEnumType, optionally computedFieldMethod for
 *    the SQL-computed-column pattern vs. a bare postLoad-populated placeholder).
 *
 * These are TS-side parameter-contract tests: which branch modifyD365File.ts picks
 * and what it hands to bridgeAddField. The bridge write itself
 * (MetadataWriteService.AddField / AddDataEntityUnmappedField) is C# with no test
 * project in this repo (see CHANGELOG / prior commits) — it needs a real D365FO VM.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { modifyD365FileTool } from '../../src/tools/write/modifyD365File';
import type { XppServerContext } from '../../src/types/context';
import type { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';

const { mockBridgeAddField, mockBridgeSetProperty, mockBridgeRefreshProvider } = vi.hoisted(() => ({
  mockBridgeAddField: vi.fn(),
  mockBridgeSetProperty: vi.fn(),
  mockBridgeRefreshProvider: vi.fn(async () => ({ success: true, elapsedMs: 1 })),
}));

vi.mock('../../src/bridge/bridgeAdapter', async (orig) => {
  const actual = await orig<typeof import('../../src/bridge/bridgeAdapter')>();
  return {
    ...actual,
    bridgeAddField: mockBridgeAddField,
    bridgeSetProperty: mockBridgeSetProperty,
    bridgeRefreshProvider: mockBridgeRefreshProvider,
    bridgeValidateAfterWrite: vi.fn(async () => null),
  };
});

const ENTITY_XML = `<?xml version="1.0" encoding="utf-8"?>
<AxDataEntityView xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
\t<Name>MyCustomEntity</Name>
\t<Label>@Contoso:Demo</Label>
\t<Fields>
\t\t<AxDataEntityViewField xmlns="" i:type="AxDataEntityViewMappedField">
\t\t\t<Name>RecId</Name>
\t\t\t<DataField>RecId</DataField>
\t\t\t<DataSource>ConDemoTable</DataSource>
\t\t</AxDataEntityViewField>
\t</Fields>
\t<Keys />
\t<Mappings />
\t<Ranges />
\t<Relations />
\t<ViewMetadata />
</AxDataEntityView>`;

const { fixture, mockWriteFile } = vi.hoisted(() => ({
  fixture: { xml: '' },
  mockWriteFile: vi.fn(async () => {}),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(async (p: string) => {
    if (typeof p === 'string' && p.endsWith('.xml')) return fixture.xml;
    if (typeof p === 'string' && p.endsWith('.rnrproj')) return `<Project><ItemGroup></ItemGroup></Project>`;
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  }),
  writeFile: mockWriteFile,
  mkdir: vi.fn(async () => {}),
  access: vi.fn(async () => {}),
  stat: vi.fn(async () => ({ isFile: () => true, isDirectory: () => false })),
  readdir: vi.fn(async () => []),
  copyFile: vi.fn(async () => {}),
  rename: vi.fn(async () => {}),
  rm: vi.fn(async () => {}),
}));

vi.mock('../../src/utils/configManager', () => ({
  getConfigManager: vi.fn(() => ({
    ensureLoaded: vi.fn(async () => {}),
    getPackagePath: vi.fn(() => 'K:\\PackagesLocalDirectory'),
    getModelName: vi.fn(() => 'MyModel'),
    getWriteAnchorModel: vi.fn(() => 'MyModel'),
    getToolProjectSwitch: vi.fn(() => null),
    getPackageNameFromWorkspacePath: vi.fn(() => 'MyPackage'),
    getProjectPath: vi.fn(async () => null),
    getSolutionPath: vi.fn(async () => null),
    getDevEnvironmentType: vi.fn(async () => 'traditional'),
    getCustomPackagesPath: vi.fn(async () => null),
    getMicrosoftPackagesPath: vi.fn(async () => null),
  })),
  fallbackPackagePath: vi.fn(() => 'C:\\AosService\\PackagesLocalDirectory'),
  extractModelFromFilePath: vi.fn(() => null),
}));

vi.mock('../../src/utils/packageResolver', () => ({
  PackageResolver: vi.fn().mockImplementation(() => ({
    resolve: vi.fn(async (m: string) => ({
      packageName: m, modelName: m, rootPath: 'K:\\PackagesLocalDirectory',
    })),
    resolveWithPackage: vi.fn((m: string, p: string) => ({
      packageName: p, modelName: m, rootPath: 'K:\\PackagesLocalDirectory',
    })),
  })),
}));

vi.mock('../../src/utils/modelClassifier', () => ({
  registerCustomModel: vi.fn(),
  resolveObjectPrefix: vi.fn(() => ''),
  applyObjectPrefix: vi.fn((name: string) => name),
  resolveRegularObjectPrefixToken: vi.fn(() => ''),
  getObjectSuffix: vi.fn(() => ''),
  applyObjectSuffix: vi.fn((name: string) => name),
  isCustomModel: vi.fn(() => true),
  isStandardModel: vi.fn(() => false),
}));

const ENTITY_FILE_PATH =
  'K:\\PackagesLocalDirectory\\MyPackage\\MyModel\\AxDataEntityView\\MyCustomEntity.xml';

const req = (args: Record<string, unknown>): CallToolRequest => ({
  method: 'tools/call',
  params: { name: 'modify_d365fo_file', arguments: args },
});

const baseArgs = (params: Record<string, unknown> = {}) => ({
  objectType: 'data-entity',
  objectName: 'MyCustomEntity',
  operation: 'add-field',
  filePath: ENTITY_FILE_PATH,
  fieldName: 'Status',
  ...params,
});

const buildContext = (): XppServerContext => {
  const stmt = { all: vi.fn(() => []), get: vi.fn(() => undefined), run: vi.fn() };
  return {
    symbolIndex: {
      searchSymbols: vi.fn(() => []),
      getSymbolByName: vi.fn(() => undefined),
      getCustomModels: vi.fn(() => ['MyModel']),
      db: { prepare: vi.fn(() => stmt) },
      getReadDb: vi.fn(function (this: any) { return this.db; }),
    } as any,
    parser: {} as any,
    cache: {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
      generateSearchKey: vi.fn((q: string) => `k:${q}`),
    } as any,
    workspaceScanner: {} as any,
    hybridSearch: {} as any,
    bridge: { isReady: true, metadataAvailable: true } as any,
  };
};

describe('add-field on a plain data-entity — unmapped/computed field', () => {
  let ctx: XppServerContext;

  beforeEach(() => {
    ctx = buildContext();
    fixture.xml = ENTITY_XML;
    mockBridgeAddField.mockReset();
    mockWriteFile.mockClear();
  });

  it('writes a bare placeholder field (fieldType/fieldBaseType, no dataField/dataSource, no computedFieldMethod)', async () => {
    mockBridgeAddField.mockResolvedValue({ success: true, message: '✅ Field added via IMetaDataEntityViewProvider.Update' });

    const result = await modifyD365FileTool(
      req(baseArgs({ fieldType: 'Description', fieldBaseType: 'String' })),
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridgeAddField).toHaveBeenCalledTimes(1);
    const call = mockBridgeAddField.mock.calls[0];
    // (bridge, objectName, fieldName, baseType, edt, mandatory, label, mapped, unmapped)
    expect(call[1]).toBe('MyCustomEntity');
    expect(call[2]).toBe('Status');
    expect(call[3]).toBe('String');       // fieldBaseType
    expect(call[4]).toBe('Description');  // fieldType is the EDT name here
    expect(call[7]).toBeUndefined();      // no mapped-field binding
    expect(call[8]).toMatchObject({ computedFieldMethod: undefined });
  });

  it('writes a SQL-computed field when computedFieldMethod is given', async () => {
    mockBridgeAddField.mockResolvedValue({ success: true, message: '✅ Field added via IMetaDataEntityViewProvider.Update' });

    const result = await modifyD365FileTool(
      req(baseArgs({
        fieldType: 'Filename',
        fieldBaseType: 'String',
        computedFieldMethod: 'defineFileName',
      })),
      ctx,
    );

    expect(result.isError).toBeFalsy();
    const call = mockBridgeAddField.mock.calls[0];
    expect(call[8]).toMatchObject({ computedFieldMethod: 'defineFileName' });
  });

  it('supports an enum-typed unmapped field via fieldEnumType, in ONE bridge call (no two-step ModifyField)', async () => {
    mockBridgeAddField.mockResolvedValue({ success: true, message: '✅ Field added via IMetaDataEntityViewProvider.Update' });

    const result = await modifyD365FileTool(
      req(baseArgs({ fieldEnumType: 'NoYes' })),
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridgeAddField).toHaveBeenCalledTimes(1);
    const call = mockBridgeAddField.mock.calls[0];
    expect(call[3]).toBe('Enum');
    expect(call[8]).toMatchObject({ enumType: 'NoYes' });
  });

  it('requires fieldType/fieldBaseType or fieldEnumType — refuses nothing was written', async () => {
    const result = await modifyD365FileTool(req(baseArgs()), ctx);

    expect(result.isError).toBe(true);
    expect(result.content[0].text as string).toMatch(/no parameter that changes anything/i);
    expect(mockBridgeAddField).not.toHaveBeenCalled();
  });
});

describe('add-field on a plain data-entity — mapped field', () => {
  let ctx: XppServerContext;

  beforeEach(() => {
    ctx = buildContext();
    fixture.xml = ENTITY_XML;
    mockBridgeAddField.mockReset();
    mockWriteFile.mockClear();
  });

  it('routes dataField + dataSource to the mapped-field binding, not the EDT path', async () => {
    mockBridgeAddField.mockResolvedValue({ success: true, message: '✅ Field added via IMetaDataEntityViewProvider.Update' });

    const result = await modifyD365FileTool(
      req(baseArgs({ dataField: 'ConCreditRating', dataSource: 'ConDemoTable' })),
      ctx,
    );

    expect(result.isError).toBeFalsy();
    const call = mockBridgeAddField.mock.calls[0];
    expect(call[4]).toBeUndefined(); // no EDT — a mapped field has none
    expect(call[7]).toMatchObject({ dataField: 'ConCreditRating', dataSource: 'ConDemoTable' });
    expect(call[8]).toBeUndefined();
  });

  it('refuses a half-bound mapped field instead of writing it', async () => {
    const result = await modifyD365FileTool(
      req(baseArgs({ dataField: 'ConCreditRating' })),
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text as string).toMatch(/BOTH dataField and dataSource/i);
    expect(mockBridgeAddField).not.toHaveBeenCalled();
  });
});

describe('modify-property on a plain data-entity — Tags / IsReadOnly', () => {
  let ctx: XppServerContext;

  beforeEach(() => {
    ctx = buildContext();
    fixture.xml = ENTITY_XML;
    mockBridgeSetProperty.mockReset();
    mockWriteFile.mockClear();
  });

  it('forwards Tags to bridgeSetProperty for objectType="data-entity"', async () => {
    mockBridgeSetProperty.mockResolvedValue({ success: true, message: "✅ Property 'Tags'='PROJ-123' set via Update" });

    const result = await modifyD365FileTool(
      req({
        objectType: 'data-entity',
        objectName: 'MyCustomEntity',
        operation: 'modify-property',
        filePath: ENTITY_FILE_PATH,
        propertyPath: 'Tags',
        propertyValue: 'PROJ-123',
      }),
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridgeSetProperty).toHaveBeenCalledWith(
      ctx.bridge, 'data-entity', 'MyCustomEntity', 'Tags', 'PROJ-123',
    );
  });

  it('forwards IsReadOnly to bridgeSetProperty for objectType="data-entity"', async () => {
    mockBridgeSetProperty.mockResolvedValue({ success: true, message: "✅ Property 'IsReadOnly'='Yes' set via Update" });

    const result = await modifyD365FileTool(
      req({
        objectType: 'data-entity',
        objectName: 'MyCustomEntity',
        operation: 'modify-property',
        filePath: ENTITY_FILE_PATH,
        propertyPath: 'IsReadOnly',
        propertyValue: 'Yes',
      }),
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridgeSetProperty).toHaveBeenCalledWith(
      ctx.bridge, 'data-entity', 'MyCustomEntity', 'IsReadOnly', 'Yes',
    );
  });
});
