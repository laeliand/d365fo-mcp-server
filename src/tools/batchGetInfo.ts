/**
 * Batch Get Info Tool
 *
 * Fetches detailed metadata for N objects in a single request — the read-side
 * counterpart of batch_search. Each object dispatches to its existing
 * get_*_info tool and all lookups run in parallel (same pattern as
 * prepare_change), eliminating one round trip per object.
 */

import type { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { XppServerContext } from '../types/context.js';
import { classInfoTool } from './classInfo.js';
import { tableInfoTool } from './tableInfo.js';
import { getFormInfoTool } from './formInfo.js';
import { getQueryInfoTool } from './queryInfo.js';
import { getViewInfoTool } from './viewInfo.js';
import { getEnumInfoTool } from './enumInfo.js';
import { getEdtInfoTool } from './edtInfo.js';
import { getReportInfoTool } from './reportInfo.js';
import { securityArtifactInfoTool } from './securityArtifactInfo.js';
import { menuItemInfoTool } from './menuItemInfo.js';
import { tableExtensionInfoTool } from './tableExtensionInfo.js';
import { dataEntityInfoTool } from './dataEntityInfo.js';

const OBJECT_TYPES = [
  'class', 'table', 'form', 'query', 'view', 'enum', 'edt', 'report',
  'data-entity', 'menu-item', 'table-extension',
  'security-privilege', 'security-duty', 'security-role',
] as const;

type ObjectType = typeof OBJECT_TYPES[number];

export const BatchGetInfoArgsSchema = z.object({
  objects: z.array(z.object({
    name: z.string().describe('Exact object name (use search/batch_search first if unsure)'),
    type: z.enum(OBJECT_TYPES).describe('Object type — selects the underlying get_*_info tool'),
  })).min(1).max(10).describe('Objects to fetch in parallel (max 10)'),
});

type InfoTool = (request: CallToolRequest, context: XppServerContext) => Promise<any>;

interface Dispatch {
  tool: InfoTool;
  toolName: string;
  buildArgs: (name: string) => Record<string, unknown>;
}

const DISPATCH: Record<ObjectType, Dispatch> = {
  'class':           { tool: classInfoTool,            toolName: 'get_class_info',            buildArgs: n => ({ className: n }) },
  'table':           { tool: tableInfoTool,            toolName: 'get_table_info',            buildArgs: n => ({ tableName: n }) },
  'form':            { tool: getFormInfoTool,          toolName: 'get_form_info',             buildArgs: n => ({ formName: n }) },
  'query':           { tool: getQueryInfoTool,         toolName: 'get_query_info',            buildArgs: n => ({ queryName: n }) },
  'view':            { tool: getViewInfoTool,          toolName: 'get_view_info',             buildArgs: n => ({ viewName: n }) },
  'enum':            { tool: getEnumInfoTool,          toolName: 'get_enum_info',             buildArgs: n => ({ enumName: n }) },
  'edt':             { tool: getEdtInfoTool,           toolName: 'get_edt_info',              buildArgs: n => ({ edtName: n }) },
  'report':          { tool: getReportInfoTool,        toolName: 'get_report_info',           buildArgs: n => ({ reportName: n }) },
  'data-entity':     { tool: dataEntityInfoTool,       toolName: 'get_data_entity_info',      buildArgs: n => ({ entityName: n }) },
  'menu-item':       { tool: menuItemInfoTool,         toolName: 'get_menu_item_info',        buildArgs: n => ({ name: n }) },
  'table-extension': { tool: tableExtensionInfoTool,   toolName: 'get_table_extension_info',  buildArgs: n => ({ tableName: n }) },
  'security-privilege': { tool: securityArtifactInfoTool, toolName: 'get_security_artifact_info', buildArgs: n => ({ name: n, artifactType: 'privilege' }) },
  'security-duty':      { tool: securityArtifactInfoTool, toolName: 'get_security_artifact_info', buildArgs: n => ({ name: n, artifactType: 'duty' }) },
  'security-role':      { tool: securityArtifactInfoTool, toolName: 'get_security_artifact_info', buildArgs: n => ({ name: n, artifactType: 'role' }) },
};

export async function batchGetInfoTool(request: CallToolRequest, context: XppServerContext) {
  const startTime = Date.now();
  const parsed = BatchGetInfoArgsSchema.safeParse(request.params.arguments ?? {});
  if (!parsed.success) {
    return {
      content: [{ type: 'text', text: `❌ batch_get_info: invalid arguments — ${parsed.error.message}` }],
      isError: true,
    };
  }

  const results = await Promise.all(
    parsed.data.objects.map(async (obj) => {
      const dispatch = DISPATCH[obj.type];
      const subRequest: CallToolRequest = {
        method: 'tools/call',
        params: { name: dispatch.toolName, arguments: dispatch.buildArgs(obj.name) },
      };
      try {
        const result = await dispatch.tool(subRequest, context);
        return { ...obj, success: !result.isError, text: result.content?.[0]?.text ?? 'No content' };
      } catch (err) {
        return { ...obj, success: false, text: `Error: ${err instanceof Error ? err.message : err}` };
      }
    }),
  );

  const okCount = results.filter(r => r.success).length;
  const sections = results.map((r, i) =>
    `## ${i + 1}. ${r.name} [${r.type.toUpperCase()}] ${r.success ? '' : '❌'}\n\n${r.text}`,
  );

  const header =
    `# Batch Get Info\n\n` +
    `Fetched: ${results.length} object(s) in parallel | Success: ${okCount}/${results.length} | ` +
    `Time: ${Date.now() - startTime}ms\n\n---\n\n`;

  return {
    content: [{ type: 'text', text: header + sections.join('\n\n---\n\n') }],
    isError: okCount === 0,
  };
}

// Tool registration (name, description, inputSchema) lives inline in
// src/server/mcpServer.ts — the single source of truth for tool instructions.
