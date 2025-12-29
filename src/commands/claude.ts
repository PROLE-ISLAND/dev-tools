import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ClaudeOptions {
  setup: boolean;
  mcp?: string;
}

export async function claudeCommand(options: ClaudeOptions) {
  try {
    if (options.setup) {
      await setupClaude();
    } else if (options.mcp) {
      await addMcpServer(options.mcp);
    } else {
      // Default: show current config status
      await showClaudeStatus();
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    process.exit(1);
  }
}

async function showClaudeStatus() {
  console.log(chalk.cyan('\n⚡ Claude Code 設定状況\n'));

  const cwd = process.cwd();
  const claudeDir = path.join(cwd, '.claude');

  // Check .claude directory
  if (await fs.pathExists(claudeDir)) {
    console.log(chalk.green('✓ .claude/ ディレクトリ存在'));

    // Check settings.json
    const settingsPath = path.join(claudeDir, 'settings.json');
    if (await fs.pathExists(settingsPath)) {
      console.log(chalk.green('✓ settings.json 存在'));
    } else {
      console.log(chalk.yellow('✗ settings.json なし'));
    }

    // Check hooks
    const hooksPath = path.join(claudeDir, 'hooks.json');
    if (await fs.pathExists(hooksPath)) {
      console.log(chalk.green('✓ hooks.json 存在'));
    } else {
      console.log(chalk.gray('  hooks.json なし（オプション）'));
    }
  } else {
    console.log(chalk.yellow('✗ .claude/ ディレクトリなし'));
  }

  // Check CLAUDE.md
  if (await fs.pathExists(path.join(cwd, 'CLAUDE.md'))) {
    console.log(chalk.green('✓ CLAUDE.md 存在'));
  } else {
    console.log(chalk.yellow('✗ CLAUDE.md なし'));
  }

  // Check environment variables
  console.log();
  console.log(chalk.cyan('環境変数:'));
  if (process.env.V0_API_KEY) {
    console.log(chalk.green('✓ V0_API_KEY 設定済み'));
  } else {
    console.log(chalk.yellow('✗ V0_API_KEY 未設定'));
  }

  console.log(`
${chalk.yellow('セットアップするには:')}
  prole claude --setup
`);
}

async function setupClaude() {
  const spinner = ora('Claude Code設定を作成中...').start();
  const cwd = process.cwd();
  const claudeDir = path.join(cwd, '.claude');

  try {
    await fs.ensureDir(claudeDir);

    // Create settings.json
    const settings = {
      permissions: {
        allow: [
          "Bash(git:*)",
          "Bash(npm:*)",
          "Bash(npx:*)",
          "Bash(gh:*)",
          "Bash(prole:*)",
          "Read",
          "Write",
          "Edit",
          "Glob",
          "Grep",
          "WebFetch",
          "WebSearch"
        ]
      },
      env: {
        V0_API_KEY: "${V0_API_KEY}"
      },
      model: "sonnet"
    };

    await fs.writeJSON(path.join(claudeDir, 'settings.json'), settings, { spaces: 2 });

    // Create hooks.json (optional but useful)
    const hooks = {
      preToolCall: [],
      postToolCall: [],
      sessionStart: [
        {
          type: "command",
          command: "echo '📋 CLAUDE.md loaded' && head -20 CLAUDE.md 2>/dev/null || true"
        }
      ]
    };

    await fs.writeJSON(path.join(claudeDir, 'hooks.json'), hooks, { spaces: 2 });

    spinner.succeed(chalk.green('Claude Code設定が完了しました！'));

    console.log(`
${chalk.cyan('作成されたファイル:')}
  - .claude/settings.json  (権限設定)
  - .claude/hooks.json     (フック設定)

${chalk.yellow('次のステップ:')}
  1. V0_API_KEY を環境変数に設定
  2. claude コマンドで開発開始
`);

  } catch (error) {
    spinner.fail(chalk.red('設定の作成に失敗しました'));
    throw error;
  }
}

async function addMcpServer(serverName: string) {
  console.log(chalk.cyan(`\n🔌 MCPサーバー追加: ${serverName}\n`));

  const knownServers: Record<string, { command: string; description: string }> = {
    'filesystem': {
      command: 'claude mcp add filesystem -- npx -y @anthropic/mcp-server-filesystem .',
      description: 'ファイルシステムアクセス'
    },
    'github': {
      command: 'claude mcp add github -- npx -y @anthropic/mcp-server-github',
      description: 'GitHub API統合'
    },
    'postgres': {
      command: 'claude mcp add postgres -- npx -y @anthropic/mcp-server-postgres $DATABASE_URL',
      description: 'PostgreSQL接続'
    }
  };

  const server = knownServers[serverName];

  if (server) {
    console.log(chalk.gray(`説明: ${server.description}`));
    console.log(chalk.yellow('\n実行コマンド:'));
    console.log(`  ${server.command}`);

    try {
      await execAsync(server.command);
      console.log(chalk.green('\n✓ MCPサーバーを追加しました'));
    } catch {
      console.log(chalk.yellow('\n手動で実行してください:'));
      console.log(`  ${server.command}`);
    }
  } else {
    console.log(chalk.yellow('利用可能なMCPサーバー:'));
    Object.entries(knownServers).forEach(([name, info]) => {
      console.log(`  ${chalk.cyan(name)}: ${info.description}`);
    });
    console.log(`\n${chalk.gray('カスタムサーバー追加:')} claude mcp add {name} -- {command}`);
  }
}
