import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface IssueOptions {
  list: boolean;
  create: boolean;
  view?: string;
}

export async function issueCommand(options: IssueOptions) {
  try {
    if (options.list) {
      await listReadyIssues();
    } else if (options.create) {
      await createIssue();
    } else if (options.view) {
      await viewIssue(options.view);
    } else {
      // Default: show ready-to-develop issues
      await listReadyIssues();
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    process.exit(1);
  }
}

async function listReadyIssues() {
  console.log(chalk.cyan('\n📋 開発可能なIssue一覧\n'));

  try {
    const { stdout } = await execAsync(
      'gh issue list -l "ready-to-develop" --json number,title,labels,assignees --limit 20'
    );

    const issues = JSON.parse(stdout);

    if (issues.length === 0) {
      console.log(chalk.yellow('  開発可能なIssueはありません'));
      console.log(chalk.gray('  (ラベル "ready-to-develop" が付いたIssueが対象)'));
      return;
    }

    issues.forEach((issue: {
      number: number;
      title: string;
      labels: Array<{ name: string }>;
      assignees: Array<{ login: string }>;
    }) => {
      const priority = issue.labels.find(l => l.name.startsWith('P'))?.name || '';
      const dod = issue.labels.find(l => l.name.includes('Bronze') || l.name.includes('Silver') || l.name.includes('Gold'))?.name || '';
      const assignee = issue.assignees.length > 0 ? chalk.gray(`@${issue.assignees[0].login}`) : '';

      console.log(`  ${chalk.cyan(`#${issue.number}`)} ${issue.title}`);
      console.log(`     ${chalk.yellow(priority)} ${chalk.magenta(dod)} ${assignee}`);
      console.log();
    });

    console.log(chalk.gray('─'.repeat(60)));
    console.log(`
${chalk.yellow('次のステップ:')}
  1. prole issue --view {番号}    # 詳細確認
  2. git checkout -b feature/issue-{番号}-{説明}
  3. 開発開始！
`);

  } catch {
    // If gh command fails, show instructions
    console.log(chalk.yellow('  gh CLI が必要です'));
    console.log(chalk.gray('  インストール: brew install gh && gh auth login'));
  }
}

async function viewIssue(number: string) {
  try {
    const { stdout } = await execAsync(`gh issue view ${number}`);
    console.log(stdout);

    console.log(chalk.gray('─'.repeat(60)));
    console.log(`
${chalk.yellow('開発開始:')}
  git checkout -b feature/issue-${number}-{説明}
`);
  } catch {
    console.error(chalk.red(`Issue #${number} が見つかりません`));
  }
}

async function createIssue() {
  console.log(chalk.cyan('\n📝 Issue作成\n'));
  console.log(chalk.yellow('GitHub Webで作成してください:'));

  try {
    const { stdout } = await execAsync('gh repo view --json url -q .url');
    const repoUrl = stdout.trim();
    console.log(`  ${repoUrl}/issues/new/choose`);

    // Try to open in browser
    await execAsync(`open "${repoUrl}/issues/new/choose"`);
  } catch {
    console.log('  gh repo view --web でリポジトリを開く');
  }

  console.log(`
${chalk.gray('Issue作成のポイント:')}
  1. 適切なテンプレートを選択（Bug/Feature）
  2. 優先度（P0-P3）を設定
  3. DoD Level を選択
  4. UI機能の場合はFigma/v0リンクを添付
`);
}
