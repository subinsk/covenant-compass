import { config } from 'dotenv'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { extractFromUrl, findCovenantSections, listEvalCompanies, runCovenantTest, searchAgreement, testCovenantInput } from './tools'

// Stdio MCP server exposing the covenant tools. Run: npm run mcp
// stdout carries the protocol, so nothing else may print to it.
config({ quiet: true })

const server = new McpServer({ name: 'covenant-compass', version: '0.1.0' })

// Runs a tool and returns its result as JSON text, or the error as a tool error.
async function respond(fn: () => unknown) {
    try {
        const result = await fn()
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    } catch (err) {
        return { content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }], isError: true }
    }
}

const url = z.url().describe('URL of a credit agreement exhibit on SEC EDGAR')

server.registerTool('list_eval_companies', {
    description: 'List the eval-set companies with their financial covenants, limits, disclosed actual ratios and agreement URLs.',
}, () => respond(listEvalCompanies))

server.registerTool('find_covenant_sections', {
    description: 'Find the financial covenant sections in a credit agreement: heading, page and the first 800 characters.',
    inputSchema: { url },
}, ({ url }) => respond(() => findCovenantSections(url)))

server.registerTool('search_agreement', {
    description: 'Case-insensitive phrase search over a credit agreement. Returns matching sentences with page numbers.',
    inputSchema: {
        url,
        query: z.string().min(1).describe('Words or phrase to find'),
        limit: z.number().int().min(1).max(50).optional().describe('Maximum sentences to return (default 10)'),
    },
}, ({ url, query, limit }) => respond(() => searchAgreement(url, query, limit)))

server.registerTool('test_covenant', {
    description: 'Evaluate a covenant formula (JSON: num, var, add, sub, mul, div, neg, max, min, cap) against inputs. '
        + 'Returns the value with a trace, any missing inputs, compliance, headroom and, for maximum ratios, '
        + 'how far the denominator can fall before a breach.',
    inputSchema: testCovenantInput.shape,
}, (input) => respond(() => runCovenantTest(input)))

server.registerTool('extract_covenants', {
    description: 'Extract financial covenants from a credit agreement with the configured LLM, with verified quotes and pages.',
    inputSchema: { url },
}, ({ url }) => respond(() => extractFromUrl(url)))

server.connect(new StdioServerTransport()).catch((err) => {
    console.error(err)
    process.exit(1)
})
