/**
 * Form Cloner — clones an existing AxForm XML into a new form, re-binding
 * datasources/fields to target tables.
 *
 * All transformations are STRING-LEVEL on the original XML text — never
 * parse/re-serialize. D365FO metadata XML is whitespace-, CDATA- and
 * namespace-marker-sensitive (tabs, CRLF, xmlns="", i:nil), and a round-trip
 * through an XML library corrupts it (the same reason normalizeD365Xml
 * exists). Regions we don't touch stay byte-identical.
 */

export interface CloneFormOptions {
  /** Name of the new form (already prefixed) */
  targetFormName: string;
  /** sourceTable → targetTable re-binding (omit to keep the source tables) */
  tableMapping?: Record<string, string>;
  /**
   * Field lookup for a target table (case-insensitive names). Return null when
   * the table is unknown — fields then pass through unfiltered.
   */
  getTableFields?: (table: string) => string[] | null;
  /** Strip form/datasource methods except classDeclaration (default true) */
  stripMethods?: boolean;
}

export interface CloneFormResult {
  xml: string;
  sourceFormName: string;
  renamedDataSources: Array<{ from: string; to: string }>;
  droppedFields: Array<{ dataSource: string; field: string }>;
  removedControls: string[];
  strippedMethods: string[];
}

interface ElementBlock {
  start: number;
  end: number; // exclusive, past the closing tag
  content: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find all top-level blocks of `tagName` inside `xml` using balanced
 * open/close counting (handles nested same-name elements, e.g. AxFormControl
 * inside AxFormControl, AxFormDataSource inside DerivedDataSources).
 * Self-closing tags (<Tag ... />) count as complete blocks.
 */
export function findElementBlocks(xml: string, tagName: string, searchStart = 0, searchEnd?: number): ElementBlock[] {
  const blocks: ElementBlock[] = [];
  const limit = searchEnd ?? xml.length;
  const openRe = new RegExp(`<${escapeRegExp(tagName)}(?=[\\s>/])`, 'g');
  const closeTag = `</${tagName}>`;

  let cursor = searchStart;
  while (cursor < limit) {
    openRe.lastIndex = cursor;
    const open = openRe.exec(xml);
    if (!open || open.index >= limit) break;

    const start = open.index;
    // Find the end of the opening tag to detect self-closing
    const tagEnd = xml.indexOf('>', start);
    if (tagEnd === -1) break;
    if (xml[tagEnd - 1] === '/') {
      blocks.push({ start, end: tagEnd + 1, content: xml.slice(start, tagEnd + 1) });
      cursor = tagEnd + 1;
      continue;
    }

    // Balanced scan for the matching close tag
    let depth = 1;
    let scan = tagEnd + 1;
    while (depth > 0 && scan < xml.length) {
      openRe.lastIndex = scan;
      const nextOpen = openRe.exec(xml);
      const nextClose = xml.indexOf(closeTag, scan);
      if (nextClose === -1) { scan = xml.length; break; }
      if (nextOpen && nextOpen.index < nextClose) {
        const innerTagEnd = xml.indexOf('>', nextOpen.index);
        if (innerTagEnd !== -1 && xml[innerTagEnd - 1] === '/') {
          scan = innerTagEnd + 1; // self-closing inner tag — depth unchanged
        } else {
          depth++;
          scan = (innerTagEnd === -1 ? nextOpen.index + 1 : innerTagEnd + 1);
        }
      } else {
        depth--;
        scan = nextClose + closeTag.length;
      }
    }
    blocks.push({ start, end: scan, content: xml.slice(start, scan) });
    cursor = scan;
  }
  return blocks;
}

/** First <Tag>value</Tag> (optionally with attributes) inside a string */
function firstElementValue(content: string, tagName: string): string | undefined {
  const m = content.match(new RegExp(`<${escapeRegExp(tagName)}(?:\\s[^>]*)?>([^<]*)</${escapeRegExp(tagName)}>`));
  return m?.[1];
}

/** Remove a set of [start,end) ranges from a string (ranges must not overlap). */
function removeRanges(xml: string, ranges: Array<{ start: number; end: number }>): string {
  let result = xml;
  for (const r of [...ranges].sort((a, b) => b.start - a.start)) {
    // Also swallow the preceding line indentation + newline for clean output
    let start = r.start;
    while (start > 0 && (result[start - 1] === '\t' || result[start - 1] === ' ')) start--;
    if (start > 0 && result[start - 1] === '\n') start--;
    if (start > 0 && result[start - 1] === '\r') start--;
    result = result.slice(0, start) + result.slice(r.end);
  }
  return result;
}

/** Replace <Tag>old</Tag> with <Tag>new</Tag> for DataSource-reference tags, token-exact. */
function replaceDsReferences(xml: string, from: string, to: string): string {
  const tags = ['DataSource', 'TitleDataSource', 'JoinSource'];
  let result = xml;
  for (const tag of tags) {
    const re = new RegExp(
      `(<${tag}(?:\\s[^>]*)?>)${escapeRegExp(from)}(</${tag}>)`,
      'g',
    );
    result = result.replace(re, `$1${to}$2`);
  }
  return result;
}

export function cloneFormXml(sourceXml: string, opt: CloneFormOptions): CloneFormResult {
  const {
    targetFormName,
    tableMapping = {},
    getTableFields,
    stripMethods = true,
  } = opt;

  let xml = sourceXml;
  const result: CloneFormResult = {
    xml: sourceXml,
    sourceFormName: '',
    renamedDataSources: [],
    droppedFields: [],
    removedControls: [],
    strippedMethods: [],
  };

  // ── 1. Form rename ─────────────────────────────────────────────────────────
  const rootNameMatch = xml.match(/<Name>([^<]+)<\/Name>/);
  if (!rootNameMatch) throw new Error('Source XML has no <Name> element — not an AxForm?');
  const sourceFormName = rootNameMatch[1];
  result.sourceFormName = sourceFormName;

  // Root <Name> — first occurrence only
  xml = xml.replace(`<Name>${sourceFormName}</Name>`, `<Name>${targetFormName}</Name>`);
  // classDeclaration + any self-references in remaining source
  xml = xml.replace(
    new RegExp(`\\bclass\\s+${escapeRegExp(sourceFormName)}\\b`, 'g'),
    `class ${targetFormName}`,
  );

  // ── 2. Method stripping (inside <SourceCode> only) ─────────────────────────
  if (stripMethods) {
    const sourceCodeBlocks = findElementBlocks(xml, 'SourceCode');
    if (sourceCodeBlocks.length > 0) {
      const sc = sourceCodeBlocks[0];
      const removals: Array<{ start: number; end: number }> = [];
      for (const method of findElementBlocks(xml, 'Method', sc.start, sc.end)) {
        const name = firstElementValue(method.content, 'Name');
        if (name && name !== 'classDeclaration') {
          result.strippedMethods.push(name);
          removals.push(method);
        }
      }
      xml = removeRanges(xml, removals);
    }
  }

  // ── 3. Datasource re-binding ───────────────────────────────────────────────
  // Locate the top-level <DataSources> AFTER </SourceCode> (the SourceCode
  // section has its own DataSources element for methods).
  const scEnd = xml.indexOf('</SourceCode>');
  const dsBlocks = findElementBlocks(xml, 'AxFormDataSource', scEnd === -1 ? 0 : scEnd);

  // Map of dsName → {table, block} for top-level datasources (DerivedDataSources
  // nested blocks are covered because findElementBlocks consumes whole outer
  // blocks; we only re-bind on the outer ones).
  // Process in REVERSE document order: replacing a block can change its length,
  // which would invalidate the absolute offsets of every later block.
  const mappingEntries = Object.entries(tableMapping);
  for (const ds of [...dsBlocks].sort((a, b) => b.start - a.start)) {
    const dsName = firstElementValue(ds.content, 'Name');
    const dsTable = firstElementValue(ds.content, 'Table');
    if (!dsName || !dsTable) continue;

    const mapped = mappingEntries.find(([src]) => src.toLowerCase() === dsTable.toLowerCase());
    if (!mapped) continue;
    const targetTable = mapped[1];

    // Replace <Table> inside this block (positional, so we don't touch other DSes)
    let newBlock = ds.content.replace(
      new RegExp(`(<Table(?:\\s[^>]*)?>)${escapeRegExp(dsTable)}(</Table>)`),
      `$1${targetTable}$2`,
    );

    // Rename the datasource itself when it carries the table's name
    const renameDs = dsName.toLowerCase() === dsTable.toLowerCase() && dsName !== targetTable;
    if (renameDs) {
      newBlock = newBlock.replace(`<Name>${dsName}</Name>`, `<Name>${targetTable}</Name>`);
      result.renamedDataSources.push({ from: dsName, to: targetTable });
    }

    xml = xml.slice(0, ds.start) + newBlock + xml.slice(ds.end);
  }

  // Re-bind <DataSource>/<TitleDataSource>/<JoinSource> references for renames
  for (const { from, to } of result.renamedDataSources) {
    xml = replaceDsReferences(xml, from, to);
  }

  // ── 4. Field filtering against target tables ───────────────────────────────
  if (getTableFields) {
    const scEnd2 = xml.indexOf('</SourceCode>');
    const removals: Array<{ start: number; end: number }> = [];
    for (const ds of findElementBlocks(xml, 'AxFormDataSource', scEnd2 === -1 ? 0 : scEnd2)) {
      const dsName = firstElementValue(ds.content, 'Name');
      const dsTable = firstElementValue(ds.content, 'Table');
      if (!dsName || !dsTable) continue;

      const fields = getTableFields(dsTable);
      if (!fields) continue; // unknown table — keep everything
      const fieldSet = new Set(fields.map((f) => f.toLowerCase()));

      for (const fieldBlock of findElementBlocks(xml, 'AxFormDataSourceField', ds.start, ds.end)) {
        const dataField = firstElementValue(fieldBlock.content, 'DataField');
        if (dataField && !fieldSet.has(dataField.toLowerCase())) {
          result.droppedFields.push({ dataSource: dsName, field: dataField });
          removals.push(fieldBlock);
        }
      }
    }
    xml = removeRanges(xml, removals);

    // Remove controls bound to dropped fields
    if (result.droppedFields.length > 0) {
      const dropped = new Set(
        result.droppedFields.map((d) => `${d.dataSource.toLowerCase()}|${d.field.toLowerCase()}`),
      );
      const controlRemovals: Array<{ start: number; end: number }> = [];
      const designStart = xml.indexOf('<Design>');
      const consumed: Array<{ start: number; end: number }> = [];
      for (const control of findElementBlocks(xml, 'AxFormControl', designStart === -1 ? 0 : designStart)) {
        // findElementBlocks returns only top-level blocks; recurse manually so
        // nested bound controls (grid columns) are found too.
        const stack: ElementBlock[] = [control];
        while (stack.length > 0) {
          const blk = stack.pop()!;
          const dataField = firstElementValue(blk.content, 'DataField');
          const dataSource = firstElementValue(blk.content, 'DataSource');
          const isBoundToDropped =
            dataField && dataSource && dropped.has(`${dataSource.toLowerCase()}|${dataField.toLowerCase()}`);
          const inner = findElementBlocks(blk.content, 'AxFormControl', blk.content.indexOf('>') + 1);
          if (isBoundToDropped && inner.length === 0) {
            // Leaf control bound to a dropped field — remove it
            const alreadyCovered = consumed.some((c) => blk.start >= c.start && blk.end <= c.end);
            if (!alreadyCovered) {
              const name = firstElementValue(blk.content, 'Name') ?? '(unnamed)';
              result.removedControls.push(name);
              controlRemovals.push({ start: blk.start, end: blk.end });
              consumed.push({ start: blk.start, end: blk.end });
            }
          } else {
            for (const child of inner) {
              stack.push({
                start: blk.start + child.start,
                end: blk.start + child.end,
                content: child.content,
              });
            }
          }
        }
      }
      xml = removeRanges(xml, controlRemovals);
    }
  }

  result.xml = xml;
  return result;
}
