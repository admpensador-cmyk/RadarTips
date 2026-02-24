#!/usr/bin/env node
/**
 * REGRESSION CHECK: Theme + Icon Constraints
 * 
 * Validates that:
 * 1) All generated HTML files have data-theme attribute on <body>
 * 2) style.css has body[data-theme="dark"] rules
 * 3) style.css has .meta-chip .ico rules with fixed width/height
 * 
 * Exit codes:
 * - 0: All checks passed
 * - 1: One or more checks failed
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

let failCount = 0;

/**
 * Recursively find all HTML files in specified directories
 */
function findHtmlFiles(dir, basePath = '') {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(basePath, entry.name);
    
    if (entry.isDirectory()) {
      results.push(...findHtmlFiles(fullPath, relativePath));
    } else if (entry.name.endsWith('.html')) {
      results.push(relativePath);
    }
  }
  
  return results;
}

console.log('🔍 REGRESSION CHECK: Theme + Icon Constraints\n');

// ===== CHECK 1: All HTML files have data-theme attribute ===== 
console.log('✓ CHECK 1: HTML files contain data-theme attribute');

const langDirs = ['pt', 'en', 'es', 'fr', 'de', 'go'];
const htmlFiles = [];

for (const lang of langDirs) {
  const langPath = path.join(rootDir, lang);
  if (fs.existsSync(langPath)) {
    const found = findHtmlFiles(langPath, lang);
    htmlFiles.push(...found);
  }
}

if (htmlFiles.length === 0) {
  console.error('❌ FAIL: No HTML files found to check');
  failCount++;
} else {
  let missingTheme = [];
  
  htmlFiles.forEach(file => {
    const fullPath = path.join(rootDir, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Check for <body data-theme="dark"> or <body data-theme="light">
    const hasTheme = /<body[^>]*data-theme=["'](dark|light)["']/.test(content);
    
    if (!hasTheme) {
      missingTheme.push(file);
    }
  });
  
  if (missingTheme.length > 0) {
    console.error(`❌ FAIL: ${missingTheme.length} HTML file(s) missing data-theme attribute:`);
    missingTheme.slice(0, 5).forEach(f => console.error(`   - ${f}`));
    if (missingTheme.length > 5) {
      console.error(`   ... and ${missingTheme.length - 5} more`);
    }
    failCount++;
  } else {
    console.log(`✅ PASS: ${htmlFiles.length} HTML files have data-theme attribute`);
  }
}

// ===== CHECK 2: style.css has dark theme rules =====
console.log('\n✓ CHECK 2: style.css contains dark theme rules');

const stylePath = path.join(rootDir, 'assets', 'css', 'style.css');

if (!fs.existsSync(stylePath)) {
  console.error('❌ FAIL: style.css not found at assets/css/style.css');
  failCount++;
} else {
  const cssContent = fs.readFileSync(stylePath, 'utf-8');
  
  // Check for body[data-theme="dark"] selector
  const hasDarkTheme = /body\[data-theme=["']dark["']\]\s*\{/.test(cssContent);
  
  if (!hasDarkTheme) {
    console.error('❌ FAIL: style.css missing body[data-theme="dark"] selector');
    failCount++;
  } else {
    // Verify it has essential dark theme variables
    const darkThemeSection = cssContent.match(/body\[data-theme=["']dark["']\]\s*\{([^}]+)\}/);
    
    if (!darkThemeSection) {
      console.error('❌ FAIL: Dark theme selector found but empty or malformed');
      failCount++;
    } else {
      const vars = darkThemeSection[1];
      const hasVars = /--bg1/.test(vars) && /--ink/.test(vars) && /--accent/.test(vars);
      
      if (!hasVars) {
        console.error('❌ FAIL: Dark theme missing essential variables (--bg1, --ink, --accent)');
        failCount++;
      } else {
        console.log('✅ PASS: Dark theme CSS rules present with essential variables');
      }
    }
  }
}

// ===== CHECK 3: style.css has icon size constraints =====
console.log('\n✓ CHECK 3: style.css contains icon size constraints');

if (!fs.existsSync(stylePath)) {
  console.error('❌ FAIL: style.css not found (already reported)');
  failCount++;
} else {
  const cssContent = fs.readFileSync(stylePath, 'utf-8');
  
  // Check for .meta-chip .ico selector with width/height
  const hasMetaChipIco = /\.meta-chip\s+\.ico\s*\{/.test(cssContent);
  
  if (!hasMetaChipIco) {
    console.error('❌ FAIL: style.css missing .meta-chip .ico selector');
    failCount++;
  } else {
    // Extract the rule and check for width/height
    const metaChipRule = cssContent.match(/\.meta-chip\s+\.ico\s*\{([^}]+)\}/);
    
    if (!metaChipRule) {
      console.error('❌ FAIL: .meta-chip .ico selector found but empty or malformed');
      failCount++;
    } else {
      const rules = metaChipRule[1];
      const hasWidth = /width\s*:\s*\d+px/.test(rules);
      const hasHeight = /height\s*:\s*\d+px/.test(rules);
      
      if (!hasWidth || !hasHeight) {
        console.error('❌ FAIL: .meta-chip .ico missing width or height constraints');
        console.error(`   Found: ${rules.trim()}`);
        failCount++;
      } else {
        // Extract the actual values
        const width = rules.match(/width\s*:\s*(\d+px)/)?.[1];
        const height = rules.match(/height\s*:\s*(\d+px)/)?.[1];
        
        console.log(`✅ PASS: Icon size constraints present (${width} × ${height})`);
      }
    }
  }
}

// ===== FINAL REPORT =====
console.log('\n' + '='.repeat(60));

if (failCount === 0) {
  console.log('✅ ALL CHECKS PASSED - No regressions detected');
  console.log('='.repeat(60));
  process.exit(0);
} else {
  console.error(`❌ ${failCount} CHECK(S) FAILED - Regression detected!`);
  console.error('='.repeat(60));
  process.exit(1);
}
