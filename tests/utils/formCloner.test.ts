/**
 * Form Cloner tests — string-level cloning of AxForm XML.
 *
 * Uses FormPatternTemplates output as a realistic source (CustGroup-shaped
 * SimpleList) plus a hand-written form with methods and two datasources.
 * Asserts: rename, table/field re-bind, dropped-field + control reporting,
 * method stripping, byte-level preservation of untouched regions, and that
 * the cloned XML still passes the form-pattern validator.
 */

import { describe, it, expect } from 'vitest';
import { FormPatternTemplates } from '../../src/utils/formPatternTemplates';
import { cloneFormXml, findElementBlocks } from '../../src/utils/formCloner';
import { injectMethodStubs, methodStubsForPattern } from '../../src/knowledge/formPatterns/methodStubs';
import { validateFormPatternXml } from '../../src/validation/formPatternValidator';

const sourceXml = () =>
  FormPatternTemplates.buildSimpleList({
    formName: 'CustGroup',
    dsName: 'CustGroup',
    dsTable: 'CustGroup',
    caption: 'Customer groups',
    gridFields: ['CustGroup', 'Name', 'PaymTermId'],
  });

const TARGET_FIELDS: Record<string, string[]> = {
  MyRentalGroup: ['CustGroup', 'Name', 'RecId'], // no PaymTermId
};

describe('findElementBlocks', () => {
  it('handles nested same-name elements with balanced counting', () => {
    const xml =
      '<AxFormControl><Name>Outer</Name><Controls>' +
      '<AxFormControl><Name>Inner</Name><Controls /></AxFormControl>' +
      '</Controls></AxFormControl>';
    const blocks = findElementBlocks(xml, 'AxFormControl');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toContain('Inner');
    expect(blocks[0].end).toBe(xml.length);
  });

  it('treats self-closing tags as complete blocks', () => {
    const xml = '<Methods /><Methods><Method /></Methods>';
    const blocks = findElementBlocks(xml, 'Methods');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].content).toBe('<Methods />');
  });
});

describe('cloneFormXml', () => {
  it('renames the form and classDeclaration', () => {
    const result = cloneFormXml(sourceXml(), { targetFormName: 'MyRentalGroupForm' });
    expect(result.sourceFormName).toBe('CustGroup');
    expect(result.xml).toContain('<Name>MyRentalGroupForm</Name>');
    expect(result.xml).toContain('class MyRentalGroupForm extends FormRun');
    expect(result.xml).not.toContain('class CustGroup');
  });

  it('re-binds the datasource table and renames same-named datasources', () => {
    const result = cloneFormXml(sourceXml(), {
      targetFormName: 'MyRentalGroupForm',
      tableMapping: { CustGroup: 'MyRentalGroup' },
    });
    expect(result.renamedDataSources).toEqual([{ from: 'CustGroup', to: 'MyRentalGroup' }]);
    expect(result.xml).toContain('<Table>MyRentalGroup</Table>');
    // Design + grid references re-bound
    expect(result.xml).toContain('<DataSource xmlns="">MyRentalGroup</DataSource>');
    expect(result.xml).toContain('<TitleDataSource xmlns="">MyRentalGroup</TitleDataSource>');
    expect(result.xml).toContain('<DataSource>MyRentalGroup</DataSource>');
    expect(result.xml).not.toContain('<Table>CustGroup</Table>');
  });

  it('drops fields missing on the target table and removes their controls', () => {
    const result = cloneFormXml(sourceXml(), {
      targetFormName: 'MyRentalGroupForm',
      tableMapping: { CustGroup: 'MyRentalGroup' },
      getTableFields: (table) => TARGET_FIELDS[table] ?? null,
    });
    expect(result.droppedFields).toEqual([{ dataSource: 'MyRentalGroup', field: 'PaymTermId' }]);
    expect(result.removedControls).toContain('Grid_PaymTermId');
    expect(result.xml).not.toContain('PaymTermId');
    // Surviving fields stay bound
    expect(result.xml).toContain('<DataField>Name</DataField>');
  });

  it('keeps all fields when the target table is unknown to the index', () => {
    const result = cloneFormXml(sourceXml(), {
      targetFormName: 'MyRentalGroupForm',
      tableMapping: { CustGroup: 'UnknownTable' },
      getTableFields: () => null,
    });
    expect(result.droppedFields).toEqual([]);
    expect(result.xml).toContain('PaymTermId');
  });

  it('strips methods except classDeclaration and reports them', () => {
    const xml = sourceXml().replace(
      '</Methods>',
      `\t\t\t<Method>\n\t\t\t\t<Name>init</Name>\n\t\t\t\t<Source><![CDATA[\npublic void init() { super(); }\n]]></Source>\n\t\t\t</Method>\n\t\t</Methods>`,
    );
    const result = cloneFormXml(xml, { targetFormName: 'MyClone' });
    expect(result.strippedMethods).toEqual(['init']);
    expect(result.xml).toContain('<Name>classDeclaration</Name>');
    expect(result.xml).not.toContain('public void init()');
  });

  it('preserves untouched regions byte-for-byte', () => {
    const src = sourceXml();
    const result = cloneFormXml(src, { targetFormName: 'MyClone' });
    // The ActionPane block contains no names/tables/methods — must be identical
    const actionPaneSrc = src.slice(src.indexOf('i:type="AxFormActionPaneControl"'), src.indexOf('CustomFilterGroup'));
    expect(result.xml).toContain(actionPaneSrc);
    // Tabs and CRLF-sensitive markers preserved
    expect(result.xml).toContain('<FormControlExtension\n\t\t\t\t\t\t\ti:nil="true" />');
  });

  it('cloned + re-bound XML still passes the pattern validator', async () => {
    const result = cloneFormXml(sourceXml(), {
      targetFormName: 'MyRentalGroupForm',
      tableMapping: { CustGroup: 'MyRentalGroup' },
      getTableFields: (table) => TARGET_FIELDS[table] ?? null,
    });
    const report = await validateFormPatternXml(result.xml);
    const errors = report.violations.filter((v) => v.severity === 'error');
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
    expect(report.pattern).toBe('SimpleList');
  });

  it('handles a two-datasource form (header+lines mapping both tables)', () => {
    const xml = FormPatternTemplates.buildDetailsTransaction({
      formName: 'SalesTable',
      dsName: 'SalesTable',
      dsTable: 'SalesTable',
      linesDsName: 'SalesLine',
      linesDsTable: 'SalesLine',
      caption: 'Orders',
      gridFields: ['SalesId'],
    });
    const result = cloneFormXml(xml, {
      targetFormName: 'MyOrderForm',
      tableMapping: { SalesTable: 'MyOrderHeader', SalesLine: 'MyOrderLine' },
    });
    expect(result.xml).toContain('<Table>MyOrderHeader</Table>');
    expect(result.xml).toContain('<Table>MyOrderLine</Table>');
    expect(result.renamedDataSources).toHaveLength(2);
  });
});

describe('injectMethodStubs', () => {
  it('injects form + datasource stubs into template XML', () => {
    const stubs = methodStubsForPattern('DetailsMaster', 'CustTable');
    const xml = FormPatternTemplates.buildDetailsMaster({
      formName: 'MyForm',
      dsName: 'CustTable',
      dsTable: 'CustTable',
      gridFields: ['AccountNum'],
    });
    const result = injectMethodStubs(xml, stubs, 'CustTable');
    expect(result.injected).toContain('init');
    expect(result.injected).toContain('CustTable.active');
    expect(result.xml).toContain('<Name>init</Name>');
    expect(result.xml).toContain('public int active()');
    // classDeclaration stays first
    expect(result.xml.indexOf('<Name>classDeclaration</Name>'))
      .toBeLessThan(result.xml.indexOf('<Name>init</Name>'));
  });

  it('stub-injected XML still passes the pattern validator', async () => {
    const stubs = methodStubsForPattern('SimpleList', 'TestDS');
    const xml = FormPatternTemplates.buildSimpleList({
      formName: 'MyForm',
      dsName: 'TestDS',
      dsTable: 'TestTable',
      gridFields: ['F1'],
    });
    const result = injectMethodStubs(xml, stubs, 'TestDS');
    const report = await validateFormPatternXml(result.xml);
    expect(report.violations.filter((v) => v.severity === 'error')).toEqual([]);
  });
});
