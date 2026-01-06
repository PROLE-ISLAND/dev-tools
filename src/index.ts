#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { v0Command } from './commands/v0.js';
import { issueCommand } from './commands/issue.js';
import { claudeCommand } from './commands/claude.js';
import { syncCommand } from './commands/sync.js';
import { validateCommand } from './commands/validate.js';

const program = new Command();

program
  .name('prole')
  .description('PROLE-ISLAND 統合開発ツール')
  .version('0.2.0');

// init command
program
  .command('init')
  .description('リポジトリを初期化（CLAUDE.md, .github/, .claude/）')
  .option('-t, --template <type>', 'テンプレートタイプ (nextjs, storyblok, library)', 'nextjs')
  .option('-w, --workflows <list>', 'ワークフローを指定 (ci,pr-check,v0-generate)')
  .option('-a, --all-workflows', '全ワークフローを適用', false)
  .option('-f, --force', '既存ファイルを上書き', false)
  .action(initCommand);

// v0 command
program
  .command('v0 [prompt]')
  .description('v0.devでUIを生成')
  .option('-t, --template <name>', 'テンプレートを使用 (form, table, card, empty-state等)')
  .option('-l, --list-templates', 'テンプレート一覧を表示', false)
  .option('-s, --save <file>', '生成コードをファイルに保存')
  .option('-o, --open', 'ブラウザでデモを開く', false)
  .action(v0Command);

// issue command
program
  .command('issue')
  .description('GitHub Issue管理')
  .option('-l, --list', '開発可能なIssue一覧', false)
  .option('-c, --create', '新規Issue作成', false)
  .option('-v, --view <number>', 'Issue詳細表示')
  .action(issueCommand);

// claude command
program
  .command('claude')
  .description('Claude Code設定')
  .option('-s, --setup', '.claude/設定ファイル生成', false)
  .option('--setup-hooks', 'PROLE-ISLAND Hooks/Commands をインストール', false)
  .option('-m, --mcp <server>', 'MCPサーバー追加')
  .action(claudeCommand);

// sync command
program
  .command('sync')
  .description('テンプレートを最新版に同期')
  .option('-d, --dry-run', '変更内容をプレビュー（実際には変更しない）', false)
  .option('-f, --force', '既存ファイルを強制上書き', false)
  .action(syncCommand);

// validate command
program
  .command('validate')
  .description('リポジトリの設定を検証')
  .option('-f, --fix', '問題を自動修正（prole sync を実行）', false)
  .option('-v, --verbose', '詳細表示', false)
  .action(validateCommand);

// Default: show help
program.parse();

if (process.argv.length === 2) {
  console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════╗
║          PROLE-ISLAND Dev Tools v0.1.0               ║
╚══════════════════════════════════════════════════════╝
`));
  program.help();
}
