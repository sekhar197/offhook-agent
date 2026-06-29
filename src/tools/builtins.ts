/**
 * Built-in tools. Deployments enable a subset via agent.yaml `tools.enabled`
 * and can register their own alongside.
 *
 * Production rules encoded here:
 * - answer_from_knowledge returns MAX 3 entries to the LLM — more floods the
 *   context and the caller. (Dominant-match may reduce further upstream.)
 * - All message fields are caller-safe (validated by the registry).
 */

import type { ToolDefinition } from './registry.js';

const MAX_ENTRIES_TO_LLM = 3;

export const answerFromKnowledge: ToolDefinition = {
  name: 'answer_from_knowledge',
  description: 'Search the knowledge base for entries matching the caller\'s question. Always search before saying something is unavailable.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What the caller is asking about, in their words' },
      exclude_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Entry ids already read aloud this call (for "more options")',
      },
    },
    required: ['query'],
  },
  async execute(args, ctx) {
    if (!ctx.searchKnowledge) {
      return { success: false, message: "I can't look that up right now." };
    }
    const query = String(args.query ?? '');
    const excludeIds = Array.isArray(args.exclude_ids) ? args.exclude_ids.map(String) : [];
    const results = (await ctx.searchKnowledge(query, excludeIds))
      .filter(r => !excludeIds.includes(r.id))
      .slice(0, MAX_ENTRIES_TO_LLM);
    if (results.length === 0) {
      return { success: true, message: "Nothing matching that — anything else I can check?", data: { entries: [] } };
    }
    return {
      success: true,
      message: `Found ${results.length === 1 ? 'it' : 'a few options'}.`,
      data: { entries: results },
    };
  },
};

export const takeMessage: ToolDefinition = {
  name: 'take_message',
  description: 'Record a message from the caller for the business owner. Confirm the caller\'s name before calling this.',
  parameters: {
    type: 'object',
    properties: {
      caller_name: { type: 'string', description: 'Caller\'s name, confirmed by read-back' },
      caller_phone: { type: 'string', description: '10-digit callback number, if given' },
      message: { type: 'string', description: 'The message, in the caller\'s words' },
    },
    required: ['caller_name', 'message'],
  },
  async execute(args, ctx) {
    if (!ctx.executeAction) {
      return { success: false, message: "I can't take messages right now — try calling back later." };
    }
    const result = await ctx.executeAction('message.take', {
      caller_name: String(args.caller_name ?? ''),
      caller_phone: args.caller_phone ? String(args.caller_phone) : undefined,
      message: String(args.message ?? ''),
      taken_at: new Date().toISOString(),
    });
    if (result.status === 'ok') {
      return { success: true, message: "Got it — I'll pass that along." };
    }
    if (result.status === 'failed_offer_transfer') {
      return { success: false, message: "I'm having trouble saving that. Want me to connect you with someone?" };
    }
    return { success: false, message: "That didn't save — mind repeating it?" };
  },
};

export const sendSummary: ToolDefinition = {
  name: 'send_summary',
  description: 'Send the owner a summary of this call (use near the end of the call).',
  parameters: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: '2-3 sentence summary of the call' },
    },
    required: ['summary'],
  },
  async execute(args, ctx) {
    if (!ctx.executeAction) {
      return { success: false, message: 'Noted.' };
    }
    const result = await ctx.executeAction('summary.send', {
      summary: String(args.summary ?? ''),
      sent_at: new Date().toISOString(),
    });
    return result.status === 'ok'
      ? { success: true, message: 'Done.' }
      : { success: false, message: 'Noted.' };
  },
};

export const transferToHuman: ToolDefinition = {
  name: 'transfer_to_human',
  description: 'Transfer the caller to a real person. Use when the caller asks for a human, after repeated failures, or on clear frustration.',
  parameters: {
    type: 'object',
    properties: {
      reason: { type: 'string', description: 'Why the caller needs a person' },
    },
    required: ['reason'],
  },
  async execute(args, ctx) {
    if (!ctx.transferToHuman) {
      return { success: false, message: "I can't transfer right now, but I can take a message." };
    }
    const result = await ctx.transferToHuman(String(args.reason ?? ''));
    // Only claim a connection if the transfer was actually placed. A failed/
    // unavailable transfer (REFER rejected, no SIP leg) must NOT be reported as
    // success — that would be a false claim to the caller.
    if (result && result.transferred === false) {
      return { success: false, message: "I'm not able to connect you directly right now, but I can take a message and pass it along." };
    }
    return { success: true, message: 'Connecting you now — one moment.' };
  },
};

export const endCall: ToolDefinition = {
  name: 'end_call',
  description: 'Hang up after the goodbye has been said. Call this only when the conversation is over.',
  parameters: { type: 'object', properties: {} },
  async execute(_args, ctx) {
    if (ctx.endCall) await ctx.endCall();
    return { success: true, message: 'Take care!' };
  },
};

export const BUILTIN_TOOLS: ToolDefinition[] = [
  answerFromKnowledge,
  takeMessage,
  sendSummary,
  transferToHuman,
  endCall,
];
