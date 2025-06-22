#!/usr/bin/env node

import { Command } from 'commander';
import { analyzeComponent } from './analyzer';
import chalk from 'chalk';
import path from 'path';

const program = new Command();

program
  .name('component-dependency-collapser')
  .description('Collapse and analyze dependencies of frontend components')
  .version('1.0.3');

program
  .argument('<Dir>', 'directory')
  .option('--tree', 'Show nested tree of dependencies')
  .option('--external-only', 'Only show external packages')
  .option('--find <package>', 'Find which components use a specific package')
  .option('--trace <target>', 'Trace import chains to a target module/package')
  .option('--size', 'Show size of components and their dependencies')
  .action(async (Dir, options) => {
    const absolutePath = path.resolve(process.cwd(), Dir);
    console.log(chalk.blue(`Analyzing: ${absolutePath}`));
    await analyzeComponent(absolutePath, options);
  });

program.parse();
