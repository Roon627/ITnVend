#!/usr/bin/env node
/* eslint-env node */
/* global process */
/**
 * Simple validation script to check for undefined component references in App.jsx
 * Run with: node scripts/validate-components.js
 */

import fs from 'fs';
import path from 'path';

const appJsxPath = path.join(process.cwd(), 'src', 'App.jsx');

try {
  const content = fs.readFileSync(appJsxPath, 'utf8');

  // Extract all imports (handle multi-line imports)
  const lines = content.split('\n');
  const imports = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Handle import statements
    if (line.startsWith('import')) {
      let importStatement = line;

      // Handle multi-line imports
      while (!importStatement.includes('from') && i + 1 < lines.length) {
        i++;
        importStatement += ' ' + lines[i].trim();
      }

      // Extract component names from import statement
      const fromMatch = importStatement.match(/from\s+['"]([^'"]+)['"]/);
      if (fromMatch) {
        // This is a default import or named import
        const importMatch = importStatement.match(/import\s+(.+)\s+from/);
        if (importMatch) {
          const importPart = importMatch[1].trim();
          if (importPart.startsWith('{') && importPart.endsWith('}')) {
            // Named imports
            const namedImports = importPart.slice(1, -1).split(',').map(item => item.trim());
            namedImports.forEach(item => {
              if (item) imports.add(item);
            });
          } else {
            // Default import
            imports.add(importPart);
          }
        }
      }
    }
  }

  // Extract all JSX component usages
  const jsxRegex = /<([A-Z][A-Za-z0-9]*)\s/g;
  const usages = new Set();
  let match;

  while ((match = jsxRegex.exec(content)) !== null) {
    usages.add(match[1]);
  }

  // Check for undefined components
  const undefinedComponents = [];
  for (const usage of usages) {
    if (!imports.has(usage)) {
      undefinedComponents.push(usage);
    }
  }

  if (undefinedComponents.length > 0) {
    console.error('❌ Found undefined component references:');
    undefinedComponents.forEach(component => {
      console.error(`  - ${component} is used but not imported`);
    });
    process.exit(1);
  } else {
    console.log('✅ All component references are properly imported');
  }

} catch (error) {
  console.error('Error validating components:', error.message);
  process.exit(1);
}