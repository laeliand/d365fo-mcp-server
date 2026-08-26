/**
 * remove-field, add-field-group, remove-field-group, add-field-to-field-group,
 * remove-method, and replace-code on a PLAIN data-entity (AxDataEntityView, not
 * an extension).
 *
 * Companion to addFieldDataEntity.test.ts, which covers add-field/modify-property
 * on the same object shape. That fix (bridge commit "add-field/modify-property
 * support for plain data-entity objects") patched MetadataWriteService.AddField to
 * try DataEntityViews.Read() after Tables/TableExtensions came up empty. remove-field
 * had the IDENTICAL gap — verified live against a real D365FO dev environment,
 * throwing the same "Table or table-extension '<name>' not found" for a real
 * AxDataEntityView — and add-field-group / remove-field-group / add-field-to-field-group
 * were audited and found to have the same gap (AxDataEntityView carries its own
 * <FieldGroups>, the same AxTableFieldGroup element a table uses). remove-method and
 * replace-code had a DIFFERENT gap: they dispatch on objectType via a switch
 * statement, and simply never had a "data-entity" case at all (unlike add-method,
 * which does).
 *
 * These are TS-side parameter-contract tests: which bridge*() function
 * modifyD365File.ts calls and with what arguments for objectType="data-entity".
 * canBridgeModify() already permits data-entity for every one of these operations
 * (BRIDGE_MODIFY_TYPES already lists "data-entity") — the routing was never the
 * problem, so these tests exist to pin the TS→bridge call shape, not to re-prove
 * gating. The actual field/method resolution fix lives in C# (MetadataWriteService.cs)
 * and has no test project in this repo — it needs a real D365FO VM.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { modifyD365FileTool } from '../../src/tools/write/modifyD365File';
import type { XppServerContext } from '../../src/types/context';
import type { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';

const {
  mockBridgeRemoveField,
  mockBridgeAddFieldGroup,
  mockBridgeRemoveFieldGroup,
  mockBridgeAddFieldToFieldGroup,
  mockBridgeRemoveMethod,
  mockBridgeReplaceCode,
  mockBridgeRefreshProvider,
} = vi.hoisted(() => ({
  mockBridgeRemoveField: vi.fn(),
  mockBridgeAddFieldGroup: vi.fn(),
  mockBridgeRemoveFieldGroup: vi.fn(),
  mockBridgeAddFieldToFieldGroup: vi.fn(),
  mockBridgeRemoveMethod: vi.fn(),
  mockBridgeReplaceCode: vi.fn(),
  mockBridgeRefreshProvider: vi.fn(async () => ({ success: true, elapsedMs: 1 })),
}));

vi.mock('../../src/bridge/bridgeAdapter', async (orig) => {
  const actual = await orig<typeof import('../../src/bridge/bridgeAdapter')>();
  return {
    ...actual,
    bridgeRemoveField: mockBridgeRemoveField,
    bridgeAddFieldGroup: mockBridgeAddFieldGroup,
    bridgeRemoveFieldGroup: mockBridgeRemoveFieldGroup,
    bridgeAddFieldToFieldGroup: mockBridgeAddFieldToFieldGroup,
    bridgeRemoveMethod: mockBridgeRemoveMethod,
    bridgeReplaceCode: mockBridgeReplaceCode,
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
\t\t<AxDataEntityViewField xmlns="" i:type="AxDataEntityViewMappedField">
\t\t\t<Name>Status</Name>
\t\t\t<DataField>Status</DataField>
\t\t\t<DataSource>ConDemoTable</DataSource>
\t\t</AxDataEntityViewField>
\t</Fields>
\t<FieldGroups>
\t\t<AxTableFieldGroup>
\t\t\t<Name>AutoReport</Name>
\t\t\t<Fields>
\t\t\t\t<AxTableFieldGroupField>
\t\t\t\t\t<DataField>Status</DataField>
\t\t\t\t</AxTableFieldGroupField>
\t\t\t</Fields>
\t\t</AxTableFieldGroup>
\t</FieldGroups>
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

const baseArgs = (operation: string, params: Record<string, unknown> = {}) => ({
  objectType: 'data-entity',
  objectName: 'MyCustomEntity',
  operation,
  filePath: ENTITY_FILE_PATH,
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

describe('remove-field on a plain data-entity', () => {
  let ctx: XppServerContext;

  beforeEach(() => {
    ctx = buildContext();
    fixture.xml = ENTITY_XML;
    mockBridgeRemoveField.mockReset();
    mockWriteFile.mockClear();
  });

  it('forwards objectName + fieldName to bridgeRemoveField for objectType="data-entity"', async () => {
    mockBridgeRemoveField.mockResolvedValue({ success: true, message: "✅ Field 'Status' removed via IMetaDataEntityViewProvider.Update" });

    const result = await modifyD365FileTool(
      req(baseArgs('remove-field', { fieldName: 'Status' })),
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridgeRemoveField).toHaveBeenCalledWith(ctx.bridge, 'MyCustomEntity', 'Status');
  });
});

describe('field-group operations on a plain data-entity', () => {
  let ctx: XppServerContext;

  beforeEach(() => {
    ctx = buildContext();
    fixture.xml = ENTITY_XML;
    mockBridgeAddFieldGroup.mockReset();
    mockBridgeRemoveFieldGroup.mockReset();
    mockBridgeAddFieldToFieldGroup.mockReset();
    mockWriteFile.mockClear();
  });

  it('forwards add-field-group to bridgeAddFieldGroup for objectType="data-entity"', async () => {
    mockBridgeAddFieldGroup.mockResolvedValue({ success: true, message: "✅ Field group 'Contoso' added via IMetaDataEntityViewProvider.Update" });

    const result = await modifyD365FileTool(
      req(baseArgs('add-field-group', { fieldGroupName: 'Contoso', fieldGroupFields: ['Status'] })),
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridgeAddFieldGroup).toHaveBeenCalledWith(
      ctx.bridge, 'MyCustomEntity', 'Contoso', undefined, ['Status'],
    );
  });

  it('forwards remove-field-group to bridgeRemoveFieldGroup for objectType="data-entity"', async () => {
    mockBridgeRemoveFieldGroup.mockResolvedValue({ success: true, message: "✅ Field group 'AutoReport' removed via IMetaDataEntityViewProvider.Update" });

    const result = await modifyD365FileTool(
      req(baseArgs('remove-field-group', { fieldGroupName: 'AutoReport' })),
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridgeRemoveFieldGroup).toHaveBeenCalledWith(ctx.bridge, 'MyCustomEntity', 'AutoReport');
  });

  it('forwards add-field-to-field-group to bridgeAddFieldToFieldGroup for objectType="data-entity"', async () => {
    mockBridgeAddFieldToFieldGroup.mockResolvedValue({ success: true, message: "✅ Field 'Status' added to group 'AutoReport' via IMetaDataEntityViewProvider.Update" });

    const result = await modifyD365FileTool(
      req(baseArgs('add-field-to-field-group', { fieldGroupName: 'AutoReport', fieldName: 'Status' })),
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridgeAddFieldToFieldGroup).toHaveBeenCalledWith(
      ctx.bridge, 'MyCustomEntity', 'AutoReport', 'Status', undefined,
    );
  });
});

describe('remove-method / replace-code on a plain data-entity', () => {
  let ctx: XppServerContext;

  beforeEach(() => {
    ctx = buildContext();
    fixture.xml = ENTITY_XML;
    mockBridgeRemoveMethod.mockReset();
    mockBridgeReplaceCode.mockReset();
    mockWriteFile.mockClear();
  });

  it('forwards remove-method to bridgeRemoveMethod with objectType="data-entity"', async () => {
    mockBridgeRemoveMethod.mockResolvedValue({ success: true, message: "✅ Method 'postLoad' removed via IMetaDataEntityViewProvider.Update" });

    const result = await modifyD365FileTool(
      req(baseArgs('remove-method', { methodName: 'postLoad' })),
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridgeRemoveMethod).toHaveBeenCalledWith(
      ctx.bridge, 'data-entity', 'MyCustomEntity', 'postLoad',
    );
  });

  it('forwards replace-code to bridgeReplaceCode with objectType="data-entity"', async () => {
    mockBridgeReplaceCode.mockResolvedValue({ success: true, message: "✅ Code replaced via Update" });

    const result = await modifyD365FileTool(
      req(baseArgs('replace-code', {
        methodName: 'postLoad',
        oldCode: 'return true;',
        newCode: 'return this.status() != Status::None;',
      })),
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(mockBridgeReplaceCode).toHaveBeenCalledWith(
      ctx.bridge, 'data-entity', 'MyCustomEntity', 'postLoad',
      'return true;', 'return this.status() != Status::None;',
    );
  });
});
