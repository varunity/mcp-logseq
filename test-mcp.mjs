#!/usr/bin/env node
/**
 * Test MCP server via stdio - sends ListTools and CallTool (list_directory).
 */
import { spawn } from 'child_process';

const graphPath = process.argv[2] || '/Users/varunbaker/Documents/VeeBrain';

const server = spawn('node', ['dist/server.js', graphPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buffer = '';
server.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.result?.tools) {
        console.log('ListTools OK, tools:', msg.result.tools.length);
      }
      if (msg.result?.content) {
        console.log('CallTool OK:', JSON.stringify(msg.result.content[0]?.text?.slice(0, 200)));
      }
    } catch (_) {}
  }
});

server.stderr.on('data', (d) => process.stderr.write(d));

function send(req) {
  server.stdin.write(JSON.stringify(req) + '\n');
}

// Initialize + ListTools
send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0' },
  },
});

setTimeout(() => {
  send({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
  });
}, 100);

setTimeout(() => {
  send({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'list_directory',
      arguments: { path: '' },
    },
  });
}, 200);

setTimeout(() => {
  send({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'read_page',
      arguments: { path: 'pages/contents.md' },
    },
  });
}, 300);

setTimeout(() => {
  server.kill();
  process.exit(0);
}, 2000);
