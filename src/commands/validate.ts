import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execAsync = promisify(exec);

interface ValidateOptions {
  fix: boolean;
  verbose: boolean;
}

interface ValidationResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  fixable?: boolean;
}

const ORG_GITHUB_REPO = 'PROLE-ISLAND/.github';

export async function validateCommand(options: ValidateOptions) {
  const spinner = ora('リポジトリの設定を検証中...').start();
  const cwd = process.cwd();
  const results: ValidationResult[] = [];

  try {
    // 1. Check if this is a git repository
    spinner.text = 'Git リポジトリを確認中...';
    const isGitRepo = await fs.pathExists(path.join(cwd, '.git'));
    if (!isGitRepo) {
      spinner.fail(chalk.red('Gitリポジトリではありません'));
      process.exit(1);
    }

    // 2. Validate CLAUDE.md
    spinner.text = 'CLAUDE.md を検証中...';
    results.push(await validateClaudeMd(cwd));

    // 3. Validate .claude/settings.json
    spinner.text = '.claude/settings.json を検証中...';
    results.push(await validateClaudeSettings(cwd));

    // 4. Validate .github structure
    spinner.text = '.github/ を検証中...';
    results.push(...await validateGitHubStructure(cwd));

    // 5. Validate workflows
    spinner.text = 'ワークフローを検証中...';
    results.push(...await validateWorkflows(cwd));

    // 6. Check for org template sync status
    spinner.text = '組織テンプレートとの同期状態を確認中...';
    results.push(await validateOrgSync(cwd));

    spinner.stop();

    // Display results
    console.log(chalk.cyan('\n📋 検証結果:\n'));

    let passCount = 0;
    let warnCount = 0;
    let failCount = 0;

    for (const result of results) {
      const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
      const color = result.status === 'pass' ? chalk.green : result.status === 'warn' ? chalk.yellow : chalk.red;

      console.log(`${icon} ${color(result.name)}`);
      if (options.verbose || result.status !== 'pass') {
        console.log(`   ${chalk.gray(result.message)}`);
      }
      if (result.fixable && result.status !== 'pass') {
        console.log(`   ${chalk.blue('→ prole sync で修正可能')}`);
      }

      if (result.status === 'pass') passCount++;
      else if (result.status === 'warn') warnCount++;
      else failCount++;
    }

    // Summary
    console.log(chalk.cyan('\n📊 サマリー:'));
    console.log(`   ${chalk.green(`✅ Pass: ${passCount}`)}  ${chalk.yellow(`⚠️ Warn: ${warnCount}`)}  ${chalk.red(`❌ Fail: ${failCount}`)}`);

    const score = Math.round((passCount / results.length) * 100);
    const scoreColor = score >= 90 ? chalk.green : score >= 70 ? chalk.yellow : chalk.red;
    console.log(`\n${chalk.cyan('統一度スコア:')} ${scoreColor(`${score}%`)}`);

    if (failCount > 0 || warnCount > 0) {
      console.log(`\n${chalk.yellow('修正するには:')} ${chalk.cyan('prole sync')}`);
    }

    // Auto-fix if requested
    if (options.fix && (failCount > 0 || warnCount > 0)) {
      console.log(chalk.yellow('\n--fix オプションが指定されました。prole sync を実行します...\n'));
      const { syncCommand } = await import('./sync.js');
      await syncCommand({ dryRun: false, force: false });
    }

  } catch (error) {
    spinner.fail(chalk.red('検証中にエラーが発生しました'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    process.exit(1);
  }
}

async function validateClaudeMd(cwd: string): Promise<ValidationResult> {
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');

  if (!await fs.pathExists(claudeMdPath)) {
    return {
      name: 'CLAUDE.md',
      status: 'fail',
      message: 'ファイルが存在しません',
      fixable: true,
    };
  }

  const content = await fs.readFile(claudeMdPath, 'utf-8');

  // Check for org section marker
  if (!content.includes('# 組織共通ルール（PROLE-ISLAND/.github より）')) {
    return {
      name: 'CLAUDE.md',
      status: 'warn',
      message: '組織共通ルールセクションがありません',
      fixable: true,
    };
  }

  return {
    name: 'CLAUDE.md',
    status: 'pass',
    message: '組織テンプレートと同期済み',
  };
}

async function validateClaudeSettings(cwd: string): Promise<ValidationResult> {
  const settingsPath = path.join(cwd, '.claude', 'settings.json');

  if (!await fs.pathExists(settingsPath)) {
    return {
      name: '.claude/settings.json',
      status: 'fail',
      message: 'ファイルが存在しません',
      fixable: true,
    };
  }

  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content);

    if (!settings.permissions?.allow) {
      return {
        name: '.claude/settings.json',
        status: 'warn',
        message: 'permissions.allow が設定されていません',
        fixable: true,
      };
    }

    return {
      name: '.claude/settings.json',
      status: 'pass',
      message: '設定OK',
    };
  } catch {
    return {
      name: '.claude/settings.json',
      status: 'fail',
      message: 'JSONパースエラー',
      fixable: true,
    };
  }
}

async function validateGitHubStructure(cwd: string): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const githubDir = path.join(cwd, '.github');

  // Check .github directory
  if (!await fs.pathExists(githubDir)) {
    return [{
      name: '.github/',
      status: 'fail',
      message: 'ディレクトリが存在しません',
      fixable: true,
    }];
  }

  // Check ISSUE_TEMPLATE
  const issueTemplateDir = path.join(githubDir, 'ISSUE_TEMPLATE');
  if (!await fs.pathExists(issueTemplateDir)) {
    results.push({
      name: '.github/ISSUE_TEMPLATE/',
      status: 'warn',
      message: 'Issueテンプレートがありません',
      fixable: true,
    });
  } else {
    const templates = await fs.readdir(issueTemplateDir);
    const ymlTemplates = templates.filter(f => f.endsWith('.yml'));
    if (ymlTemplates.length === 0) {
      results.push({
        name: '.github/ISSUE_TEMPLATE/',
        status: 'warn',
        message: 'テンプレートファイルがありません',
        fixable: true,
      });
    } else {
      results.push({
        name: '.github/ISSUE_TEMPLATE/',
        status: 'pass',
        message: `${ymlTemplates.length}個のテンプレート`,
      });
    }
  }

  // Check PR template
  const prTemplatePath = path.join(githubDir, 'PULL_REQUEST_TEMPLATE.md');
  if (!await fs.pathExists(prTemplatePath)) {
    results.push({
      name: '.github/PULL_REQUEST_TEMPLATE.md',
      status: 'warn',
      message: 'PRテンプレートがありません',
      fixable: true,
    });
  } else {
    results.push({
      name: '.github/PULL_REQUEST_TEMPLATE.md',
      status: 'pass',
      message: 'OK',
    });
  }

  // Check dependabot
  const dependabotPath = path.join(githubDir, 'dependabot.yml');
  if (!await fs.pathExists(dependabotPath)) {
    results.push({
      name: '.github/dependabot.yml',
      status: 'warn',
      message: 'Dependabotが設定されていません',
      fixable: true,
    });
  } else {
    results.push({
      name: '.github/dependabot.yml',
      status: 'pass',
      message: 'OK',
    });
  }

  return results;
}

async function validateWorkflows(cwd: string): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  const workflowsDir = path.join(cwd, '.github', 'workflows');

  if (!await fs.pathExists(workflowsDir)) {
    return [{
      name: '.github/workflows/',
      status: 'fail',
      message: 'ワークフローディレクトリがありません',
      fixable: true,
    }];
  }

  const workflows = await fs.readdir(workflowsDir);
  const ymlWorkflows = workflows.filter(f => f.endsWith('.yml'));

  if (ymlWorkflows.length === 0) {
    results.push({
      name: '.github/workflows/',
      status: 'warn',
      message: 'ワークフローがありません',
      fixable: true,
    });
  } else {
    // Check for essential workflows
    const hasCI = ymlWorkflows.some(f => f.includes('ci'));
    if (hasCI) {
      results.push({
        name: 'CI ワークフロー',
        status: 'pass',
        message: 'CI設定あり',
      });
    } else {
      results.push({
        name: 'CI ワークフロー',
        status: 'warn',
        message: 'CIワークフローがありません',
        fixable: true,
      });
    }
  }

  return results;
}

async function validateOrgSync(cwd: string): Promise<ValidationResult> {
  try {
    // Fetch org CLAUDE.md and compare hash
    const { stdout: orgContent } = await execAsync(
      `gh api repos/${ORG_GITHUB_REPO}/contents/CLAUDE.md --jq '.content' | base64 -d`
    );

    const claudeMdPath = path.join(cwd, 'CLAUDE.md');
    if (!await fs.pathExists(claudeMdPath)) {
      return {
        name: '組織テンプレート同期',
        status: 'fail',
        message: 'CLAUDE.mdがないため比較不可',
        fixable: true,
      };
    }

    const localContent = await fs.readFile(claudeMdPath, 'utf-8');

    // Check if org content is included in local
    if (localContent.includes(orgContent.trim().slice(0, 100))) {
      return {
        name: '組織テンプレート同期',
        status: 'pass',
        message: '最新の組織テンプレートと同期済み',
      };
    } else {
      return {
        name: '組織テンプレート同期',
        status: 'warn',
        message: '組織テンプレートと差分があります',
        fixable: true,
      };
    }
  } catch {
    return {
      name: '組織テンプレート同期',
      status: 'warn',
      message: 'gh CLIで取得できません（オフラインまたは認証なし）',
    };
  }
}
