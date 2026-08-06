#!/usr/bin/env node
/**
 * Procura identificadores usados sem declaração no front — a classe de erro que
 * derruba a tela inteira em runtime (ReferenceError) sem o build reclamar,
 * porque o esbuild do Vite não faz análise de escopo.
 *
 * Exemplo real: o estado `plan` foi declarado no componente errado e a aba
 * "criar conta" ficou em branco.
 *
 * USO:  node scripts/check-escopo.mjs
 * Sai com código 1 se encontrar algo — dá para usar em CI.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as acorn from 'acorn';

const RAIZ = 'apps/web/src';

// Acha o binário do esbuild instalado no projeto. Depender de `npx` no PATH
// falha silenciosamente no Windows e faria a checagem passar sem analisar nada.
function acharEsbuild() {
  if (process.env.ESBUILD) return process.env.ESBUILD.split(' ');
  const req = createRequire(import.meta.url);
  for (const base of ['apps/web/package.json', 'package.json']) {
    try {
      const pkg = req.resolve('esbuild/package.json', { paths: [join(process.cwd(), base, '..')] });
      const bin = join(pkg, '..', 'bin', 'esbuild');
      return [process.platform === 'win32' ? bin + '.exe' : bin];
    } catch { /* tenta o próximo */ }
  }
  const local = join('node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');
  return [local];
}
const ESBUILD = acharEsbuild();

// Globais de navegador/JS que não são declarados no arquivo.
const GLOBAIS = new Set([
  'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'location',
  'console', 'fetch', 'Blob', 'File', 'FileReader', 'FormData', 'Headers', 'Request',
  'Response', 'URL', 'URLSearchParams', 'AbortController', 'Image', 'Audio',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'queueMicrotask', 'structuredClone', 'crypto', 'atob', 'btoa', 'alert', 'confirm', 'prompt',
  'JSON', 'Math', 'Date', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'RegExp', 'Error', 'TypeError',
  'Intl', 'isNaN', 'isFinite', 'parseInt', 'parseFloat', 'encodeURIComponent',
  'decodeURIComponent', 'globalThis', 'undefined', 'NaN', 'Infinity', 'process',
  'createImageBitmap', 'OffscreenCanvas', 'ResizeObserver', 'IntersectionObserver',
  'MutationObserver', 'WebSocket', 'EventSource', 'Notification', 'matchMedia', 'getComputedStyle',
]);

function arquivos(dir) {
  const out = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else if (/\.tsx?$/.test(nome) && !nome.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

// Remove os tipos com esbuild — o acorn só entende JS puro.
function paraJs(arquivo) {
  const [cmd, ...args] = ESBUILD;
  // O --loader só vale lendo da entrada padrão; passando o arquivo, o esbuild
  // deduz o loader pela extensão.
  return execFileSync(cmd, [...args, arquivo, '--format=esm', '--jsx=automatic'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// --- análise de escopo ------------------------------------------------------
function nomesDoPadrao(node, out = []) {
  if (!node) return out;
  switch (node.type) {
    case 'Identifier': out.push(node.name); break;
    case 'ObjectPattern': node.properties.forEach((p) => nomesDoPadrao(p.value ?? p.argument, out)); break;
    case 'ArrayPattern': node.elements.forEach((e) => nomesDoPadrao(e, out)); break;
    case 'AssignmentPattern': nomesDoPadrao(node.left, out); break;
    case 'RestElement': nomesDoPadrao(node.argument, out); break;
  }
  return out;
}

function analisar(codigo, arquivo) {
  const ast = acorn.parse(codigo, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const problemas = [];

  function novoEscopo(pai) {
    return { pai, nomes: new Set() };
  }
  function declarar(escopo, nome) {
    if (nome) escopo.nomes.add(nome);
  }
  function existe(escopo, nome) {
    for (let e = escopo; e; e = e.pai) if (e.nomes.has(nome)) return true;
    return GLOBAIS.has(nome);
  }

  // 1ª passada: hoisting de declarações dentro de um corpo.
  function hoist(corpo, escopo) {
    for (const st of corpo) {
      if (st.type === 'VariableDeclaration') st.declarations.forEach((d) => nomesDoPadrao(d.id).forEach((n) => declarar(escopo, n)));
      else if (st.type === 'FunctionDeclaration') declarar(escopo, st.id?.name);
      else if (st.type === 'ClassDeclaration') declarar(escopo, st.id?.name);
      else if (st.type === 'ImportDeclaration') st.specifiers.forEach((s) => declarar(escopo, s.local.name));
      else if (st.type === 'ExportNamedDeclaration' && st.declaration) hoist([st.declaration], escopo);
      else if (st.type === 'ExportDefaultDeclaration' && st.declaration?.id) declarar(escopo, st.declaration.id.name);
    }
  }

  function visitar(node, escopo) {
    if (!node || typeof node.type !== 'string') return;

    switch (node.type) {
      case 'Program': {
        const e = novoEscopo(null);
        hoist(node.body, e);
        node.body.forEach((st) => visitar(st, e));
        return;
      }
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        const e = novoEscopo(escopo);
        if (node.id) declarar(e, node.id.name);
        node.params.forEach((p) => nomesDoPadrao(p).forEach((n) => declarar(e, n)));
        if (node.body.type === 'BlockStatement') {
          hoist(node.body.body, e);
          node.body.body.forEach((st) => visitar(st, e));
        } else {
          visitar(node.body, e);
        }
        return;
      }
      case 'BlockStatement': {
        const e = novoEscopo(escopo);
        hoist(node.body, e);
        node.body.forEach((st) => visitar(st, e));
        return;
      }
      case 'CatchClause': {
        const e = novoEscopo(escopo);
        if (node.param) nomesDoPadrao(node.param).forEach((n) => declarar(e, n));
        visitar(node.body, e);
        return;
      }
      case 'ForStatement': case 'ForInStatement': case 'ForOfStatement': {
        const e = novoEscopo(escopo);
        for (const chave of ['init', 'left']) {
          const alvo = node[chave];
          if (alvo?.type === 'VariableDeclaration') alvo.declarations.forEach((d) => nomesDoPadrao(d.id).forEach((n) => declarar(e, n)));
        }
        for (const chave of ['init', 'test', 'update', 'left', 'right', 'body']) visitar(node[chave], e);
        return;
      }
      case 'ExportSpecifier':
        // Em `export { X as default }`, só o lado local é referência real.
        visitar(node.local, escopo);
        return;
      case 'ImportSpecifier': case 'ImportDefaultSpecifier': case 'ImportNamespaceSpecifier':
        return;
      case 'MetaProperty':
        // import.meta / new.target não são identificadores de escopo.
        return;
      case 'LabeledStatement': case 'BreakStatement': case 'ContinueStatement':
        return;
      case 'MemberExpression':
        visitar(node.object, escopo);
        if (node.computed) visitar(node.property, escopo);
        return;
      case 'Property':
        if (node.computed) visitar(node.key, escopo);
        visitar(node.value, escopo);
        return;
      case 'Identifier':
        if (!existe(escopo, node.name)) {
          problemas.push({ nome: node.name, linha: node.loc.start.line });
        }
        return;
    }

    for (const chave of Object.keys(node)) {
      if (chave === 'loc' || chave === 'start' || chave === 'end') continue;
      const v = node[chave];
      if (Array.isArray(v)) v.forEach((x) => visitar(x, escopo));
      else if (v && typeof v.type === 'string') visitar(v, escopo);
    }
  }

  visitar(ast, null);

  // Deduplica por nome, mantendo a primeira linha.
  const vistos = new Map();
  for (const p of problemas) if (!vistos.has(p.nome)) vistos.set(p.nome, p.linha);
  return [...vistos].map(([nome, linha]) => ({ arquivo, nome, linha }));
}

// --- execução ---------------------------------------------------------------
let achados = 0;
let analisados = 0;
let falhas = 0;
for (const arquivo of arquivos(RAIZ)) {
  let js;
  try {
    js = paraJs(arquivo);
    analisados++;
  } catch (e) {
    console.error(`! não consegui transpilar ${arquivo}: ${e.message.split('\n')[0]}`);
    falhas++;
    continue;
  }
  for (const p of analisar(js, arquivo)) {
    console.log(`${relative('.', p.arquivo)}: "${p.nome}" usado sem declaração (linha ~${p.linha} do JS gerado)`);
    achados++;
  }
}

if (falhas > 0) {
  console.error(`\nFALHA: ${falhas} arquivo(s) não puderam ser analisados — a checagem NÃO é confiável.`);
  console.error(`Instale as dependências (npm install) ou aponte o binário: ESBUILD=caminho/para/esbuild node scripts/check-escopo.mjs`);
  process.exit(2);
}
console.log(
  achados === 0
    ? `\nNenhum identificador solto encontrado (${analisados} arquivos analisados).`
    : `\n${achados} identificador(es) sem declaração.`,
);
process.exit(achados === 0 ? 0 : 1);
