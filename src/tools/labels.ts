/**
 * Labels Tool — unified label-operations entry point.
 *
 * Replaces the four per-action label tools (search_labels, get_label_info,
 * create_label, rename_label) with one tool discriminated by `action`.
 * Dispatches to the existing handler for that action via a local registry;
 * handler files stay where they are — only the MCP surface is consolidated.
 *
 * Read actions (search, info) work in every server mode. Write actions
 * (create, rename) require Windows-VM filesystem access and fail with the
 * underlying handler's clear error message when called from Azure read-only.
 */

import type { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { XppServerContext } from '../types/context.js';
import { searchLabelsTool } from './searchLabels.js';
import { getLabelInfoTool } from './getLabelInfo.js';
import { createLabelTool } from './createLabel.js';
import { renameLabelTool } from './renameLabel.js';

export type LabelsTool = (request: CallToolRequest, context: XppServerContext) => Promise<any>;

export const LABEL_ACTIONS = ['search', 'info', 'create', 'rename'] as const;
export type LabelAction = (typeof LABEL_ACTIONS)[number];

interface LabelDispatch {
  tool: LabelsTool;
  toolName: string;
}

export const LABEL_DISPATCH: Record<LabelAction, LabelDispatch> = {
  search: { tool: searchLabelsTool, toolName: 'search_labels' },
  info:   { tool: getLabelInfoTool, toolName: 'get_label_info' },
  create: { tool: createLabelTool,  toolName: 'create_label' },
  rename: { tool: renameLabelTool,  toolName: 'rename_label' },
};

const LabelsArgsSchema = z
  .object({
    action: z.enum(LABEL_ACTIONS).describe(
      'Which label operation to run: ' +
      'search (full-text query, read), info (translations for a label ID or list of label files, read), ' +
      'create (add a new label to an AxLabelFile, write), rename (rename a label ID across .label.txt + X++ + XML, write).',
    ),
  })
  .passthrough();

export async function labelsTool(request: CallToolRequest, context: XppServerContext) {
  const parsed = LabelsArgsSchema.safeParse(request.params.arguments ?? {});
  if (!parsed.success) {
    return {
      content: [{ type: 'text', text: `❌ labels: invalid arguments — ${parsed.error.message}` }],
      isError: true,
    };
  }

  const { action, ...rest } = parsed.data;
  const dispatch = LABEL_DISPATCH[action as LabelAction];
  if (!dispatch) {
    return {
      content: [{ type: 'text', text: `❌ labels: unsupported action "${action}".` }],
      isError: true,
    };
  }

  const subRequest: CallToolRequest = {
    method: 'tools/call',
    params: { name: dispatch.toolName, arguments: rest },
  };
  return dispatch.tool(subRequest, context);
}

// Tool registration (name, description, inputSchema) lives inline in
// src/server/mcpServer.ts — the single source of truth for tool instructions.
