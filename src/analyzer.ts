
import { Project, SourceFile } from 'ts-morph';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import * as ts from 'typescript';


const seenFiles = new Set<string>();

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  
  function calculateDependencySize(
    sourceFile: SourceFile,
    visited = new Set<string>(),
    project: Project,
    tsConfigPaths: Record<string, string[]> | null = null,
    baseUrl: string | null = null
  ): number {
    const filePath = sourceFile.getFilePath();
    if (visited.has(filePath)) return 0;
    visited.add(filePath);
  
    let totalSize = 0;
    try {
      const stat = fs.statSync(filePath);
      totalSize += stat.size;
    } catch {
      // ignore
    }
  
    const imports = sourceFile.getImportDeclarations();
    for (const imp of imports) {
      const spec = imp.getModuleSpecifierValue();
  
      let resolvedPath: string | null = null;
  
      if (spec.startsWith('.') || spec.startsWith('/')) {
        resolvedPath = imp.getModuleSpecifierSourceFile()?.getFilePath() ?? null;
      } else if (tsConfigPaths && baseUrl) {
        resolvedPath = resolveAliasImport(spec, tsConfigPaths, baseUrl);
        if (resolvedPath) {
          for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
            const fullPath = `${resolvedPath}${ext}`;
            if (fs.existsSync(fullPath)) {
              resolvedPath = fullPath;
              break;
            }
          }
        }
      }
  
      if (resolvedPath && fs.existsSync(resolvedPath)) {
        const importedFile = project.addSourceFileAtPathIfExists(resolvedPath);
        if (importedFile) {
          totalSize += calculateDependencySize(importedFile, visited, project, tsConfigPaths, baseUrl);
        }
      }
    }
  
    return totalSize;
  }
  

// Load tsconfig.json paths and baseUrl
function getTSConfigPaths(rootDir: string) {
  const configFile = ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.json');
  if (!configFile) return null;

  const configText = ts.sys.readFile(configFile);
  if (!configText) return null;

  const result = ts.parseConfigFileTextToJson(configFile, configText);
  if (!result.config) return null;

  const compilerOptions = result.config.compilerOptions || {};
  const baseUrl = compilerOptions.baseUrl || '.';
  const paths = compilerOptions.paths || {};

  return { baseUrl: path.resolve(path.dirname(configFile), baseUrl), paths };
}

// Resolve alias imports like '@components/Button' -> 'src/components/Button'
function resolveAliasImport(specifier: string, tsConfigPaths: Record<string, string[]>, baseUrl: string): string | null {
  for (const alias in tsConfigPaths) {
    const aliasPattern = alias.replace(/\*/g, '(.*)');
    const regex = new RegExp(`^${aliasPattern}$`);
    const match = specifier.match(regex);
    if (match) {
      const replacements = tsConfigPaths[alias];
      if (replacements && replacements.length > 0) {
        // Replace '*' with matched group or empty string
        const replacement = replacements[0].replace('*', match[1] || '');
        const resolvedPath = path.resolve(baseUrl, replacement);
        return resolvedPath;
      }
    }
  }
  return null;
}

async function traceImportChains(
    project: Project,
    sourceFile: SourceFile,
    target: string,
    pathStack: string[] = [],
    visited = new Set<string>(),
    results: string[][] = [],
    tsConfigPaths: Record<string, string[]> | null = null,
    baseUrl: string | null = null
  ) {
    const filePath = sourceFile.getFilePath();
  
    if (visited.has(filePath)) return;
    visited.add(filePath);
    pathStack.push(filePath);
  
    const imports = sourceFile.getImportDeclarations();
  
    const matchesTarget = imports.some((imp) => {
      const spec = imp.getModuleSpecifierValue();
      const baseName = path.basename(spec).replace(/\.(tsx?|jsx?)$/, '');
      return (
        spec === target ||
        spec.startsWith(`${target}/`) ||
        baseName === target
      );
    });
  
    if (matchesTarget) {
      results.push([...pathStack]);
    } else {
      for (const imp of imports) {
        const spec = imp.getModuleSpecifierValue();
  
        if (spec.startsWith('.') || spec.startsWith('/')) {
          const importedFilePath = imp.getModuleSpecifierSourceFile()?.getFilePath();
          if (importedFilePath) {
            const importedFile = project.addSourceFileAtPathIfExists(importedFilePath);
            if (importedFile) {
              await traceImportChains(project, importedFile, target, pathStack, visited, results, tsConfigPaths, baseUrl);
            }
          }
        } else if (tsConfigPaths && baseUrl) {
          // Try resolving alias imports here too
          const aliasResolved = resolveAliasImport(spec, tsConfigPaths, baseUrl);
          if (aliasResolved) {
            for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs']) {
              const testPath = `${aliasResolved}${ext}`;
              if (fs.existsSync(testPath)) {
                const importedFile = project.addSourceFileAtPathIfExists(testPath);
                if (importedFile) {
                  await traceImportChains(project, importedFile, target, pathStack, visited, results, tsConfigPaths, baseUrl);
                }
                break;
              }
            }
            for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs']) {
              const testPath = path.join(aliasResolved, `index${ext}`);
              if (fs.existsSync(testPath)) {
                const importedFile = project.addSourceFileAtPathIfExists(testPath);
                if (importedFile) {
                  await traceImportChains(project, importedFile, target, pathStack, visited, results, tsConfigPaths, baseUrl);
                }
                break;
              }
            }
          }
        }
      }
    }
  
    pathStack.pop();
    visited.delete(filePath);
  
    return results;
  }
  
function importContainsPackage(sourceFile: SourceFile, target: string): boolean {
    const imports = sourceFile.getImportDeclarations();
  
    return imports.some((imp) => {
      const spec = imp.getModuleSpecifierValue();
  
      // Normalize for internal or external
      const isMatch =
        spec === target ||
        spec.startsWith(`${target}/`) ||
        path.basename(spec).replace(/\.(tsx?|jsx?)$/, '') === target;
  
      return isMatch;
    });
  }

function analyzeFileRecursive(
    sourceFile: SourceFile,
    depth = 0,
    options: any = {},
    tsConfigPaths: Record<string, string[]> | null = null,
    baseUrl: string | null = null,
    visitedSize = new Map<string, number>() // cache for file sizes
  ) {
    const indent = '  '.repeat(depth);
    const filePath = sourceFile.getFilePath();
  
    if (seenFiles.has(filePath)) {
      console.log(`${indent}${chalk.gray('(already visited)')} ${path.basename(filePath)}`);
      return;
    }
  
    seenFiles.add(filePath);
  
    // Calculate own size for current file
    let sizeStr = '';
    if (options.tree) {
      let size = visitedSize.get(filePath);
      if (size === undefined) {
        try {
          const stat = fs.statSync(filePath);
          size = stat.size;
        } catch {
          size = 0;
        }
        visitedSize.set(filePath, size);
      }
      sizeStr = ` (${formatBytes(size)})`;
    }
  
    // Print root file with 📄 and size if depth=0
    if (depth === 0 && options.tree) {
      console.log(`📄 ${chalk.cyan(path.basename(filePath))}${sizeStr}`);
    }
  
    const imports = sourceFile.getImportDeclarations();
  
    // Filter imports for externalOnly flag
    const visibleImports = imports.filter((imp) => {
      const specifier = imp.getModuleSpecifierValue();
      const isExternal = !specifier.startsWith('.') && !specifier.startsWith('/');
      return !options.externalOnly || (options.externalOnly && isExternal);
    });
  
    visibleImports.forEach((imp, index) => {
      const specifier = imp.getModuleSpecifierValue();
      const isExternal = !specifier.startsWith('.') && !specifier.startsWith('/');
  
      const label = isExternal ? chalk.yellow('📦') : chalk.cyan('🔗');
      const isLast = index === visibleImports.length - 1;
      const branch = options.tree ? (isLast ? '└── ' : '├── ') : '';
  
      // Calculate size for imported file (only internal)
      let importSizeStr = '';
      if (options.tree && !isExternal) {
        try {
          const resolvedPath = resolveImport(sourceFile, specifier, tsConfigPaths, baseUrl);
          if (resolvedPath && fs.existsSync(resolvedPath)) {
            let impSize = visitedSize.get(resolvedPath);
            if (impSize === undefined) {
              impSize = fs.statSync(resolvedPath).size;
              visitedSize.set(resolvedPath, impSize);
            }
            importSizeStr = ` (${formatBytes(impSize)})`;
          }
        } catch {
          importSizeStr = '';
        }
      }
  
      console.log(`${indent}${branch}${label} ${specifier}${importSizeStr}`);
  
      // Recurse only for internal imports
      if (!isExternal) {
        try {
          const resolvedPath = resolveImport(sourceFile, specifier, tsConfigPaths, baseUrl);
          if (resolvedPath && fs.existsSync(resolvedPath)) {
            const childSource = sourceFile.getProject().addSourceFileAtPathIfExists(resolvedPath);
            if (childSource) {
              analyzeFileRecursive(
                childSource,
                depth + 1,
                options,
                tsConfigPaths,
                baseUrl,
                visitedSize
              );
            }
          }
        } catch (e) {
          console.warn(`${indent}${chalk.red('⚠️ Failed to resolve')}: ${specifier}`);
        }
      }
    });
  }
  

// now resolve @ based imports too 
function resolveImport(
    sourceFile: SourceFile,
    specifier: string,
    tsConfigPaths: Record<string, string[]> | null,
    baseUrl: string | null
  ): string | null {
    const baseDir = path.dirname(sourceFile.getFilePath());
  
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      // Relative import - existing logic
      const fullPath = path.resolve(baseDir, specifier);
  
      for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs']) {
        const testPath = `${fullPath}${ext}`;
        if (fs.existsSync(testPath)) return testPath;
      }
  
      for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs']) {
        const testPath = path.join(fullPath, `index${ext}`);
        if (fs.existsSync(testPath)) return testPath;
      }
  
      return null;
    }
  
    // Non-relative, try alias resolution if available
    if (tsConfigPaths && baseUrl) {
      const aliasResolved = resolveAliasImport(specifier, tsConfigPaths, baseUrl);
      if (aliasResolved) {
        for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs']) {
          const testPath = `${aliasResolved}${ext}`;
          if (fs.existsSync(testPath)) return testPath;
        }
        for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mjs']) {
          const testPath = path.join(aliasResolved, `index${ext}`);
          if (fs.existsSync(testPath)) return testPath;
        }
      }
    }
  
    // Could be an external package or unresolved import
    return null;
  }
  

//trace function added 
export async function analyzeComponent(entryPath: string, options: any) {
    const project = new Project();
    const allFiles: string[] = [];
    const tsConfig = getTSConfigPaths(process.cwd());
    const tsConfigPaths = tsConfig?.paths || null;
    const baseUrl = tsConfig?.baseUrl || null;

    if (fs.lstatSync(entryPath).isDirectory()) {
      const fastGlob = await import('fast-glob');
      const matches = await fastGlob.default(`${entryPath}/**/*.{ts,tsx,js,jsx}`);
      allFiles.push(...matches.map((m) => path.resolve(m)));
    } else {
      allFiles.push(path.resolve(entryPath));
    }
  
    const targetPackage = options.find;
    const traceTarget = options.trace;
    const sizeTarget = options.size;
    const foundIn: string[] = [];
  
    if (sizeTarget) {
        const sizeResults: { file: string; size: number }[] = [];
      
        for (const filePath of allFiles) {
          const sourceFile = project.addSourceFileAtPathIfExists(filePath);
          if (!sourceFile) continue;
      
          const totalSizeBytes = calculateDependencySize(
            sourceFile,
            new Set(),
            project,
            tsConfigPaths,
            baseUrl
          );
      
          sizeResults.push({
            file: path.relative(process.cwd(), filePath),
            size: totalSizeBytes
          });
        }
      
        sizeResults.sort((a, b) => b.size - a.size);
      
        console.log(chalk.green(`\n📦 Component Size Analysis:`));
        console.log();
      
        sizeResults.forEach((res, idx) => {
          const rankStyle =
            idx === 0
              ? chalk.red.bold
              : idx === 1
              ? chalk.yellow.bold
              : idx === 2
              ? chalk.magenta
              : chalk.cyan;
      
          console.log(`${rankStyle(res.file)} → ${chalk.bold(formatBytes(res.size))}`);
        });
      
        console.log(); // spacing
        return;
      }
      
      
    if (traceTarget) {
      let totalResults: string[][] = [];
  
      for (const filePath of allFiles) {
        const sourceFile = project.addSourceFileAtPathIfExists(filePath);
        if (!sourceFile) continue;
  
        // const chains = await traceImportChains(project, sourceFile, traceTarget);
        const chains = await traceImportChains(project, sourceFile, traceTarget, [], new Set(), [], tsConfigPaths, baseUrl);

        if (chains && chains.length > 0) {
          totalResults = totalResults.concat(chains);
        }
      }
  
      if (totalResults.length === 0) {
        console.log(chalk.yellow(`⚠️ No import chains found to: ${traceTarget}`));
      } else {
        console.log(chalk.green(`✔ Found import chains to: ${traceTarget}\n`));
  
        for (const chain of totalResults) {
          // Indented tree output
        //   for (let i = 0; i < chain.length; i++) {
        //     const indent = '  '.repeat(i);
        //     console.log(`${indent}${path.relative(process.cwd(), chain[i])}`);
        //   }
        for (let i = 0; i < chain.length; i++) {
            const indent = '  '.repeat(i);
            const fileRelative = path.relative(process.cwd(), chain[i]);
            if (i === 0) {
              // First item: print with 📄
              console.log(`📄 ${fileRelative}`);
            } else {
              // Subsequent items: print with arrow
              console.log(`${indent}↳ ${fileRelative}`);
            }
          }
          console.log();
  
          // Compact arrow-chain output
          const compact = chain
            .map((f) => path.basename(f).replace(/\.(tsx?|jsx?)$/, ''))
            .join(' → ');
          console.log(`🔗 Chain: ${compact}\n`);
        }
      }
  
      return;
    }
  
    // Existing find mode
    if (targetPackage) {
      for (const filePath of allFiles) {
        const sourceFile = project.addSourceFileAtPathIfExists(filePath);
        if (!sourceFile) continue;
  
        if (importContainsPackage(sourceFile, targetPackage)) {
          foundIn.push(filePath);
        }
      }
  
      if (foundIn.length === 0) {
        console.log(chalk.yellow(`⚠️ No files found importing: ${targetPackage}`));
      } else {
        console.log(chalk.green(`\n✔ Found in:`));
        foundIn.forEach((file) => {
          console.log(`- ${path.relative(process.cwd(), file)}`);
        });
      }
  
      return;
    }
   // Normal or tree mode
   const htmlTrees = [];

    // Normal or tree mode
    for (const filePath of allFiles) {
      const sourceFile = project.addSourceFileAtPathIfExists(filePath);
      if (!sourceFile) continue;
  
      seenFiles.clear();
      console.log(chalk.green(`\n📁 Component: ${path.relative(process.cwd(), filePath)}\n`));
    //   analyzeFileRecursive(sourceFile, 0, options);
    //   analyzeFileRecursive(sourceFile, 0, options, tsConfigPaths, baseUrl);
      analyzeFileRecursive(
        sourceFile,
        0,
        options,
        tsConfigPaths,
        baseUrl,
        new Map() // track visited file sizes
      );
      
    }
    
  }