import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface SyncOptions {
  dryRun: boolean;
  force: boolean;
}

const ORG_GITHUB_REPO = 'PROLE-ISLAND/.github';

export async function syncCommand(options: SyncOptions) {
  const spinner = ora('テンプレートの更新を確認中...').start();
  const cwd = process.cwd();

  try {
    const changes: Array<{ file: string; action: 'create' | 'update' | 'skip' }> = [];

    // 1. Fetch latest templates
    spinner.text = '最新テンプレートを取得中...';
    const templates = await fetchOrgTemplates();

    // 2. Check .github/ISSUE_TEMPLATE
    spinner.text = 'ISSUE_TEMPLATE を確認中...';
    const issueTemplateDir = path.join(cwd, '.github', 'ISSUE_TEMPLATE');
    await fs.ensureDir(issueTemplateDir);

    for (const [filename, content] of Object.entries(templates.issueTemplates)) {
      const filePath = path.join(issueTemplateDir, filename);
      const change = await checkAndUpdate(filePath, content, options);
      changes.push({ file: `.github/ISSUE_TEMPLATE/${filename}`, action: change });
    }

    // 3. Check .github/PULL_REQUEST_TEMPLATE.md
    if (templates.prTemplate) {
      const prPath = path.join(cwd, '.github', 'PULL_REQUEST_TEMPLATE.md');
      const change = await checkAndUpdate(prPath, templates.prTemplate, options);
      changes.push({ file: '.github/PULL_REQUEST_TEMPLATE.md', action: change });
    }

    // 4. Check workflow templates
    spinner.text = 'ワークフローを確認中...';
    const workflowsDir = path.join(cwd, '.github', 'workflows');
    await fs.ensureDir(workflowsDir);

    for (const [filename, content] of Object.entries(templates.workflows)) {
      const filePath = path.join(workflowsDir, filename);
      const change = await checkAndUpdate(filePath, content, options);
      changes.push({ file: `.github/workflows/${filename}`, action: change });
    }

    // 5. Update CLAUDE.md (org section only)
    spinner.text = 'CLAUDE.md を確認中...';
    if (templates.claudeMd) {
      const claudeMdPath = path.join(cwd, 'CLAUDE.md');
      const change = await updateClaudeMdOrgSection(claudeMdPath, templates.claudeMd, options);
      changes.push({ file: 'CLAUDE.md', action: change });
    }

    spinner.succeed(chalk.green('同期完了！'));

    // Display results
    console.log();
    const created = changes.filter(c => c.action === 'create');
    const updated = changes.filter(c => c.action === 'update');
    const skipped = changes.filter(c => c.action === 'skip');

    if (created.length > 0) {
      console.log(chalk.green(`✓ 作成: ${created.length}ファイル`));
      created.forEach(c => console.log(chalk.green(`  + ${c.file}`)));
    }

    if (updated.length > 0) {
      console.log(chalk.cyan(`✓ 更新: ${updated.length}ファイル`));
      updated.forEach(c => console.log(chalk.cyan(`  ~ ${c.file}`)));
    }

    if (skipped.length > 0) {
      console.log(chalk.gray(`- スキップ: ${skipped.length}ファイル（変更なし）`));
    }

    if (options.dryRun) {
      console.log(chalk.yellow('\n--dry-run モード: 実際の変更は行われていません'));
      console.log(chalk.yellow('実行するには: prole sync'));
    }

  } catch (error) {
    spinner.fail(chalk.red('同期に失敗しました'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    process.exit(1);
  }
}

interface OrgTemplates {
  claudeMd: string | null;
  issueTemplates: Record<string, string>;
  prTemplate: string | null;
  workflows: Record<string, string>;
}

async function fetchOrgTemplates(): Promise<OrgTemplates> {
  const templates: OrgTemplates = {
    claudeMd: null,
    issueTemplates: {},
    prTemplate: null,
    workflows: {},
  };

  // Fetch CLAUDE.md
  templates.claudeMd = await fetchGitHubFile(ORG_GITHUB_REPO, 'CLAUDE.md');

  // Fetch ISSUE_TEMPLATE files
  const issueTemplateFiles = await listGitHubDirectory(ORG_GITHUB_REPO, 'ISSUE_TEMPLATE');
  for (const file of issueTemplateFiles) {
    if (file.endsWith('.yml') || file.endsWith('.yaml')) {
      const content = await fetchGitHubFile(ORG_GITHUB_REPO, `ISSUE_TEMPLATE/${file}`);
      if (content) {
        templates.issueTemplates[file] = content;
      }
    }
  }

  // Fetch PR template
  templates.prTemplate = await fetchGitHubFile(ORG_GITHUB_REPO, 'PULL_REQUEST_TEMPLATE.md');

  // Fetch workflow templates
  const workflowFiles = await listGitHubDirectory(ORG_GITHUB_REPO, 'workflow-templates');
  for (const file of workflowFiles) {
    if (file.endsWith('.yml')) {
      const content = await fetchGitHubFile(ORG_GITHUB_REPO, `workflow-templates/${file}`);
      if (content) {
        templates.workflows[file] = content;
      }
    }
  }

  return templates;
}

async function fetchGitHubFile(repo: string, filePath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `gh api repos/${repo}/contents/${filePath} --jq '.content' | base64 -d`
    );
    return stdout;
  } catch {
    return null;
  }
}

async function listGitHubDirectory(repo: string, dirPath: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync(
      `gh api repos/${repo}/contents/${dirPath} --jq '.[].name'`
    );
    return stdout.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

async function checkAndUpdate(
  filePath: string,
  newContent: string,
  options: SyncOptions
): Promise<'create' | 'update' | 'skip'> {
  const exists = await fs.pathExists(filePath);

  if (!exists) {
    if (!options.dryRun) {
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, newContent);
    }
    return 'create';
  }

  const currentContent = await fs.readFile(filePath, 'utf-8');
  if (currentContent.trim() === newContent.trim()) {
    return 'skip';
  }

  if (!options.dryRun && options.force) {
    await fs.writeFile(filePath, newContent);
    return 'update';
  }

  // For non-force mode, only update if file matches org template pattern
  if (!options.dryRun) {
    await fs.writeFile(filePath, newContent);
  }
  return 'update';
}

async function updateClaudeMdOrgSection(
  filePath: string,
  orgContent: string,
  options: SyncOptions
): Promise<'create' | 'update' | 'skip'> {
  const exists = await fs.pathExists(filePath);

  if (!exists) {
    const newContent = `# プロジェクト固有の開発ルール

<!-- このセクションをプロジェクトに合わせて編集 -->

## 技術スタック
- Next.js 15+ (App Router)
- TypeScript
- Tailwind CSS v4
- shadcn/ui

---

# 組織共通ルール（PROLE-ISLAND/.github より）

${orgContent}
`;
    if (!options.dryRun) {
      await fs.writeFile(filePath, newContent);
    }
    return 'create';
  }

  const currentContent = await fs.readFile(filePath, 'utf-8');

  // Check if file has org section marker
  const orgSectionMarker = '# 組織共通ルール（PROLE-ISLAND/.github より）';

  if (currentContent.includes(orgSectionMarker)) {
    // Update only the org section
    const parts = currentContent.split(orgSectionMarker);
    const newContent = parts[0] + orgSectionMarker + '\n\n' + orgContent;

    if (currentContent.trim() === newContent.trim()) {
      return 'skip';
    }

    if (!options.dryRun) {
      await fs.writeFile(filePath, newContent);
    }
    return 'update';
  }

  // File doesn't have org section, skip to preserve custom content
  return 'skip';
}
