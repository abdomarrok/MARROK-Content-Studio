import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * ARCHITECTURE BOUNDARY TEST SUITE
 * 
 * Enforces architectural governance and dependency direction rules across
 * MARROK Content Studio to prevent monolithic regression and technical debt.
 */

async function getSourceFiles(dir: string, extensions = ['.ts', '.tsx']): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        files.push(...(await getSourceFiles(fullPath, extensions)));
      }
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

describe('Architecture Governance & Boundary Enforcement', () => {
  const rootDir = process.cwd();
  const srcDir = path.resolve(rootDir, 'src');
  const apiDir = path.resolve(rootDir, 'api');

  describe('1. Core Engine Public Facade Enforcement', () => {
    it('enforces that external consumers do not directly import from src/lib/qa/ internals', async () => {
      const allFiles = await getSourceFiles(srcDir);
      const violations: string[] = [];

      for (const file of allFiles) {
        const normFile = normalizePath(file);
        // Exclude test suite itself and internal engine directory
        if (normFile.endsWith('architectureBoundary.test.ts')) continue;
        if (normFile.includes('/src/lib/qa/')) continue;
        if (normFile.endsWith('/src/lib/qaChecks.ts')) continue;

        const content = await fs.readFile(file, 'utf-8');
        if (/from\s+['"][^'"]*\/qa\/(?!index)[^'"]+['"]/.test(content)) {
          violations.push(path.relative(rootDir, file));
        }
      }

      expect(violations, `Found direct internal imports from src/lib/qa/: ${violations.join(', ')}`).toEqual([]);
    });

    it('enforces that external consumers do not directly import from src/lib/synthesis/smartVisual/ internals', async () => {
      const allFiles = await getSourceFiles(srcDir);
      const violations: string[] = [];

      for (const file of allFiles) {
        const normFile = normalizePath(file);
        if (normFile.endsWith('architectureBoundary.test.ts')) continue;
        if (normFile.includes('/src/lib/synthesis/smartVisual/')) continue;
        if (normFile.endsWith('/src/lib/synthesis/smartVisualDefaults.ts')) continue;

        const content = await fs.readFile(file, 'utf-8');
        if (/from\s+['"][^'"]*\/smartVisual\/(?!index)[^'"]+['"]/.test(content)) {
          violations.push(path.relative(rootDir, file));
        }
      }

      expect(violations, `Found direct internal imports from src/lib/synthesis/smartVisual/: ${violations.join(', ')}`).toEqual([]);
    });

    it('enforces that external consumers do not directly import from src/lib/canvas/layout/ internals', async () => {
      const allFiles = await getSourceFiles(srcDir);
      const violations: string[] = [];

      for (const file of allFiles) {
        const normFile = normalizePath(file);
        if (normFile.endsWith('architectureBoundary.test.ts')) continue;
        if (normFile.includes('/src/lib/canvas/layout/')) continue;
        if (normFile.endsWith('/src/lib/canvas/layoutAwareness.ts')) continue;

        const content = await fs.readFile(file, 'utf-8');
        if (/from\s+['"][^'"]*\/canvas\/layout\/(?!index)[^'"]+['"]/.test(content)) {
          violations.push(path.relative(rootDir, file));
        }
      }

      expect(violations, `Found direct internal imports from src/lib/canvas/layout/: ${violations.join(', ')}`).toEqual([]);
    });

    it('enforces that external consumers do not directly import from src/lib/synthesis/extractor/ internals', async () => {
      const allFiles = await getSourceFiles(srcDir);
      const violations: string[] = [];

      for (const file of allFiles) {
        const normFile = normalizePath(file);
        if (normFile.endsWith('architectureBoundary.test.ts')) continue;
        if (normFile.includes('/src/lib/synthesis/extractor/')) continue;
        if (normFile.endsWith('/src/lib/synthesis/universalExtractor.ts')) continue;

        const content = await fs.readFile(file, 'utf-8');
        if (/from\s+['"][^'"]*\/extractor\/(?!index)[^'"]+['"]/.test(content)) {
          violations.push(path.relative(rootDir, file));
        }
      }

      expect(violations, `Found direct internal imports from src/lib/synthesis/extractor/: ${violations.join(', ')}`).toEqual([]);
    });
  });

  describe('2. Serverless API / Browser Decoupling Boundary', () => {
    it('enforces that api/ modules never import browser components, hooks, or DOM rendering modules', async () => {
      const apiFiles = await getSourceFiles(apiDir);
      const bannedImportPatterns = [
        /(?:import|from)\s+['"][^'"]*\/components\/[^'"]*['"]/,
        /(?:import|from)\s+['"][^'"]*\/hooks\/[^'"]*['"]/,
        /(?:import|from)\s+['"][^'"]*\/canvas\/renderSlide[^'"]*['"]/,
        /(?:import|from)\s+['"][^'"]*\/canvas\/exporter[^'"]*['"]/,
        /(?:import|from)\s+['"][^'"]*\/canvas\/imageLoader[^'"]*['"]/,
        /(?:import|from)\s+['"][^'"]*\/canvas\/videoFrameExtractor[^'"]*['"]/,
        /(?:import|from)\s+['"][^'"]*\/storage\/indexedDb[^'"]*['"]/,
      ];

      const violations: { file: string; match: string }[] = [];

      for (const file of apiFiles) {
        const content = await fs.readFile(file, 'utf-8');
        for (const pattern of bannedImportPatterns) {
          if (pattern.test(content)) {
            violations.push({ file: path.relative(rootDir, file), match: pattern.toString() });
          }
        }
      }

      expect(violations, `Serverless API files import prohibited browser modules: ${JSON.stringify(violations)}`).toEqual([]);
    });

    it('enforces that api/ modules never access window or document browser globals', async () => {
      const apiFiles = await getSourceFiles(apiDir);
      const violations: string[] = [];

      for (const file of apiFiles) {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('//') || line.startsWith('*')) continue;
          if (/\b(window|document)\.[a-zA-Z]/.test(line)) {
            violations.push(`${path.relative(rootDir, file)}:${i + 1} (${line})`);
          }
        }
      }

      expect(violations, `API files reference browser DOM globals: ${violations.join(', ')}`).toEqual([]);
    });
  });

  describe('3. UI Component Infrastructure Isolation', () => {
    it('enforces that extracted panel and inspector components do not directly import node:fs or pg', async () => {
      const panelFiles = await getSourceFiles(path.resolve(srcDir, 'components', 'studio', 'panels'));
      const inspectorFiles = await getSourceFiles(path.resolve(srcDir, 'components', 'studio', 'inspector'));
      const uiFiles = [...panelFiles, ...inspectorFiles];

      const violations: string[] = [];

      for (const file of uiFiles) {
        const content = await fs.readFile(file, 'utf-8');
        if (/from\s+['"](node:)?(fs|fs\/promises|pg|child_process)['"]/.test(content)) {
          violations.push(path.relative(rootDir, file));
        }
      }

      expect(violations, `UI components import Node infrastructure directly: ${violations.join(', ')}`).toEqual([]);
    });
  });

  describe('4. Hosting Platform Constraints', () => {
    it('enforces that the total recursive file count in api/ remains strictly <= 12 (Vercel Hobby limit)', async () => {
      async function countFilesRecursive(dir: string): Promise<number> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        let count = 0;
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            count += await countFilesRecursive(full);
          } else if (entry.isFile()) {
            count += 1;
          }
        }
        return count;
      }

      const totalFiles = await countFilesRecursive(apiDir);
      expect(totalFiles).toBeLessThanOrEqual(12);
      expect(totalFiles).toBe(11); // Currently exactly 11 files
    });
  });

  describe('5. Type Safety & Client Bundle Hygiene Guards', () => {
    /**
     * Strips single-line comments, block comments, string literals, and template literal
     * static spans while preserving newlines and `${...}` expression bodies so line numbers
     * stay accurate and copy/comments containing the word "any" never cause false positives.
     */
    function stripCommentsAndStrings(source: string): string {
      let out = '';
      let i = 0;
      const len = source.length;
      const templateExprBraceStack: number[] = [];

      while (i < len) {
        const ch = source[i];
        const next = source[i + 1];

        // Single-line comment
        if (ch === '/' && next === '/') {
          out += '  ';
          i += 2;
          while (i < len && source[i] !== '\n') {
            out += ' ';
            i += 1;
          }
          continue;
        }

        // Block comment
        if (ch === '/' && next === '*') {
          out += '  ';
          i += 2;
          while (i < len) {
            if (source[i] === '*' && source[i + 1] === '/') {
              out += '  ';
              i += 2;
              break;
            }
            out += source[i] === '\n' ? '\n' : ' ';
            i += 1;
          }
          continue;
        }

        // Single or double quoted string
        if (ch === "'" || ch === '"') {
          const quote = ch;
          out += ' ';
          i += 1;
          while (i < len) {
            if (source[i] === '\\') {
              out += '  ';
              i += 2;
              continue;
            }
            if (source[i] === quote) {
              out += ' ';
              i += 1;
              break;
            }
            out += source[i] === '\n' ? '\n' : ' ';
            i += 1;
          }
          continue;
        }

        // Template literal start or resume after closing `}` of `${...}`
        const resumingTemplate =
          ch === '}' &&
          templateExprBraceStack.length > 0 &&
          templateExprBraceStack[templateExprBraceStack.length - 1] === 0;

        if (ch === '`' || resumingTemplate) {
          if (resumingTemplate) {
            templateExprBraceStack.pop();
            out += '}';
            i += 1;
          } else {
            out += ' ';
            i += 1;
          }
          while (i < len) {
            if (source[i] === '\\') {
              out += '  ';
              i += 2;
              continue;
            }
            if (source[i] === '$' && source[i + 1] === '{') {
              templateExprBraceStack.push(0);
              out += ' {';
              i += 2;
              break;
            }
            if (source[i] === '`') {
              out += ' ';
              i += 1;
              break;
            }
            out += source[i] === '\n' ? '\n' : ' ';
            i += 1;
          }
          continue;
        }

        if (ch === '{' && templateExprBraceStack.length > 0) {
          templateExprBraceStack[templateExprBraceStack.length - 1] += 1;
        } else if (ch === '}' && templateExprBraceStack.length > 0) {
          templateExprBraceStack[templateExprBraceStack.length - 1] -= 1;
        }

        out += ch;
        i += 1;
      }

      return out;
    }

    it('enforces zero explicit any annotations or casts across production src/ and api/ files', async () => {
      const candidateFiles = [
        ...(await getSourceFiles(srcDir)),
        ...(await getSourceFiles(apiDir)),
      ].filter((file) => {
        const norm = normalizePath(file);
        return (
          !norm.includes('/src/test/') &&
          !norm.endsWith('.test.ts') &&
          !norm.endsWith('.test.tsx') &&
          !norm.endsWith('.d.ts')
        );
      });

      const explicitAnyRe = /:\s*any\b|\bas\s+any\b|<any>/;
      const violations: string[] = [];

      for (const file of candidateFiles) {
        const raw = await fs.readFile(file, 'utf-8');
        const cleaned = stripCommentsAndStrings(raw);
        const lines = cleaned.split('\n');
        for (let idx = 0; idx < lines.length; idx += 1) {
          if (explicitAnyRe.test(lines[idx])) {
            violations.push(`${path.relative(rootDir, file)}:${idx + 1} (${lines[idx].trim()})`);
          }
        }
      }

      expect(
        violations,
        `Found explicit \`any\` in production code:\n${violations.join('\n')}`
      ).toEqual([]);
    });

    it('enforces zero node:crypto imports inside client-bundled src/components/ and src/hooks/ files', async () => {
      const clientFiles = [
        ...(await getSourceFiles(path.resolve(srcDir, 'components'))),
        ...(await getSourceFiles(path.resolve(srcDir, 'hooks'))),
      ].filter((file) => {
        const norm = normalizePath(file);
        return !norm.endsWith('.test.ts') && !norm.endsWith('.test.tsx');
      });

      const violations: string[] = [];

      for (const file of clientFiles) {
        const content = await fs.readFile(file, 'utf-8');
        if (/(?:import|from)\s+['"](?:node:)?crypto['"]/.test(content)) {
          violations.push(path.relative(rootDir, file));
        }
      }

      expect(
        violations,
        `Client UI components/hooks must not import node:crypto: ${violations.join(', ')}`
      ).toEqual([]);
    });
  });
});
