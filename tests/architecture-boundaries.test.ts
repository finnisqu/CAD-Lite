import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SOURCE_MODULES = import.meta.glob('../src/**/*.ts', {
  eager: true,
  import: 'default',
  query: '?raw',
});

const ALLOWED_LAYER_IMPORTS: Record<string, ReadonlySet<string>> = {
  core: new Set(['core']),
  geometry: new Set(['core', 'geometry']),
  domain: new Set(['core', 'geometry', 'domain']),
  persistence: new Set(['core', 'geometry', 'domain', 'persistence']),
  app: new Set(['core', 'geometry', 'domain', 'persistence', 'app']),
  browser: new Set([
    'core',
    'geometry',
    'domain',
    'persistence',
    'app',
    'browser',
  ]),
};

function sourcePath(modulePath: string): string {
  return modulePath.replace(/^\.\.\/src\//, '');
}

function sourceLayer(path: string): string | null {
  return path.split('/')[0] ?? null;
}

function relativeModuleSpecifiers(file: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  sourceFile.forEachChild((node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.startsWith('.')
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
  });

  return specifiers;
}

function importedLayer(file: string, specifier: string): string | null {
  const parts = file.split('/');
  parts.pop();

  specifier.split('/').forEach((part) => {
    if (!part || part === '.') return;
    if (part === '..') {
      parts.pop();
      return;
    }
    parts.push(part);
  });

  return sourceLayer(parts.join('/'));
}

describe('architecture dependency boundaries', () => {
  it('keeps lower layers from importing upward', () => {
    const violations: string[] = [];

    Object.entries(SOURCE_MODULES).forEach(([modulePath, source]) => {
      const file = sourcePath(modulePath);
      const layer = sourceLayer(file);
      if (!layer) return;
      const allowed = ALLOWED_LAYER_IMPORTS[layer];
      if (!allowed) return;

      relativeModuleSpecifiers(file, source).forEach((specifier) => {
        const targetLayer = importedLayer(file, specifier);
        if (!targetLayer || allowed.has(targetLayer)) return;
        violations.push(`${file} -> ${specifier} (${targetLayer})`);
      });
    });

    expect(violations).toEqual([]);
  });

  it('keeps browser surfaces from committing store state directly', () => {
    const violations = Object.entries(SOURCE_MODULES).flatMap(
      ([modulePath, source]) => {
        const file = sourcePath(modulePath);
        if (!file.startsWith('browser/')) return [];
        return /\b(?:this\.)?store\.(?:commit|replaceState)\s*\(/.test(source)
          ? [file]
          : [];
      },
    );

    expect(violations).toEqual([]);
  });
});
