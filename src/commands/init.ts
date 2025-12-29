import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface InitOptions {
  template: 'nextjs' | 'storyblok' | 'library';
  force: boolean;
  workflows?: string;
  allWorkflows: boolean;
}

const ORG_GITHUB_REPO = 'PROLE-ISLAND/.github';

// Template-specific workflow configurations
const TEMPLATE_WORKFLOWS: Record<string, string[]> = {
  'nextjs': ['ci.yml', 'pr-check.yml'],
  'storyblok': ['ci.yml', 'pr-check.yml'],
  'library': ['ci.yml', 'pr-check.yml'],
};

// Available workflows with descriptions
const WORKFLOW_INFO: Record<string, string> = {
  'ci.yml': 'CI（lint, 型チェック, テスト, ビルド）',
  'pr-check.yml': 'PR規約チェック',
  'v0-generate.yml': 'v0.dev UI自動生成（ラベルトリガー）',
};

export async function initCommand(options: InitOptions) {
  const spinner = ora('最新テンプレートを取得中...').start();
  const cwd = process.cwd();

  try {
    // 1. Fetch templates from organization .github repo
    spinner.text = 'PROLE-ISLAND/.github から最新テンプレートを取得中...';

    const templates = await fetchOrgTemplates();

    // 2. Determine which workflows to apply
    const selectedWorkflows = determineWorkflows(templates.workflows, options);
    spinner.text = `Workflows: ${selectedWorkflows.join(', ')}`;

    // 3. Create .github directory structure
    spinner.text = '.github/ を作成中...';
    await createGitHubStructure(cwd, templates, selectedWorkflows, options);

    // 4. Create/update CLAUDE.md
    spinner.text = 'CLAUDE.md を作成中...';
    await createClaudeMd(cwd, templates, options);

    // 5. Create .claude directory
    spinner.text = '.claude/ を作成中...';
    await createClaudeConfig(cwd, options);

    spinner.succeed(chalk.green('リポジトリの初期化が完了しました！'));

    console.log(`
${chalk.cyan('取得元:')} https://github.com/${ORG_GITHUB_REPO}
${chalk.cyan('テンプレート:')} ${options.template}
${chalk.cyan('適用ワークフロー:')} ${selectedWorkflows.join(', ')}

${chalk.yellow('次のステップ:')}
  1. CLAUDE.md をプロジェクトに合わせて編集
  2. V0_API_KEY を環境変数に設定
  3. ${chalk.cyan('prole v0 "コンポーネント作成"')} でUI生成開始

${chalk.gray('v0 UI生成ワークフローを追加するには:')}
  ${chalk.cyan('prole init --workflows v0-generate')}
  ${chalk.gray('または')}
  ${chalk.cyan('prole init --all-workflows')}
`);
  } catch (error) {
    spinner.fail(chalk.red('初期化に失敗しました'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }

    // Fallback to local templates if fetch fails
    console.log(chalk.yellow('\nフォールバック: ローカルテンプレートを使用します'));
    await createLocalTemplates(cwd, options);
  }
}

function determineWorkflows(
  availableWorkflows: Record<string, string>,
  options: InitOptions
): string[] {
  // If --all-workflows, use all available
  if (options.allWorkflows) {
    return Object.keys(availableWorkflows);
  }

  // If --workflows specified, parse and validate
  if (options.workflows) {
    const requested = options.workflows.split(',').map(w => w.trim());
    const valid = requested.filter(w => {
      const filename = w.endsWith('.yml') ? w : `${w}.yml`;
      if (!availableWorkflows[filename]) {
        console.log(chalk.yellow(`  警告: ワークフロー「${w}」が見つかりません`));
        return false;
      }
      return true;
    });
    // Normalize to .yml extension
    return valid.map(w => w.endsWith('.yml') ? w : `${w}.yml`);
  }

  // Default: use template-specific workflows
  const templateWorkflows = TEMPLATE_WORKFLOWS[options.template] || TEMPLATE_WORKFLOWS['nextjs'];
  return templateWorkflows.filter(w => availableWorkflows[w]);
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

  try {
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

  } catch (error) {
    console.log(chalk.yellow('  一部のテンプレート取得に失敗、ローカルフォールバック使用'));
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

async function createGitHubStructure(
  cwd: string,
  templates: OrgTemplates,
  selectedWorkflows: string[],
  options: InitOptions
) {
  const githubDir = path.join(cwd, '.github');
  const workflowsDir = path.join(githubDir, 'workflows');
  const issueTemplateDir = path.join(githubDir, 'ISSUE_TEMPLATE');

  await fs.ensureDir(workflowsDir);
  await fs.ensureDir(issueTemplateDir);

  // Write issue templates from org
  for (const [filename, content] of Object.entries(templates.issueTemplates)) {
    await writeFileIfNotExists(path.join(issueTemplateDir, filename), content, options.force);
  }

  // Write PR template from org
  if (templates.prTemplate) {
    await writeFileIfNotExists(path.join(githubDir, 'PULL_REQUEST_TEMPLATE.md'), templates.prTemplate, options.force);
  }

  // Write only selected workflow templates
  for (const filename of selectedWorkflows) {
    const content = templates.workflows[filename];
    if (content) {
      await writeFileIfNotExists(path.join(workflowsDir, filename), content, options.force);
      const info = WORKFLOW_INFO[filename] || filename;
      console.log(chalk.blue(`  ワークフロー: ${filename} (${info})`));
    }
  }

  // Dependabot (always create locally as it's repo-specific)
  const dependabot = `version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      dependencies:
        patterns:
          - "*"
`;
  await writeFileIfNotExists(path.join(githubDir, 'dependabot.yml'), dependabot, options.force);
}

async function createClaudeMd(cwd: string, templates: OrgTemplates, options: InitOptions) {
  const techStack = getTechStackForTemplate(options.template);

  if (templates.claudeMd) {
    // Use org template as base, add project-specific header
    const projectClaudeMd = `# プロジェクト固有の開発ルール

<!-- このセクションをプロジェクトに合わせて編集 -->

## 技術スタック
${techStack}

---

# 組織共通ルール（PROLE-ISLAND/.github より）

${templates.claudeMd}
`;
    await writeFileIfNotExists(path.join(cwd, 'CLAUDE.md'), projectClaudeMd, options.force);
  } else {
    await createLocalClaudeMd(cwd, options);
  }
}

function getTechStackForTemplate(template: string): string {
  switch (template) {
    case 'storyblok':
      return `- Next.js 15+ (App Router)
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- Storyblok CMS`;
    case 'library':
      return `- TypeScript
- tsup (ビルド)
- Vitest (テスト)`;
    case 'nextjs':
    default:
      return `- Next.js 15+ (App Router)
- TypeScript
- Tailwind CSS v4
- shadcn/ui`;
  }
}

async function createClaudeConfig(cwd: string, options: InitOptions) {
  const claudeDir = path.join(cwd, '.claude');
  await fs.ensureDir(claudeDir);

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
        "Grep"
      ]
    },
    env: {
      V0_API_KEY: "${V0_API_KEY}"
    },
    mcpServers: {
      "filesystem": {
        "command": "npx",
        "args": ["-y", "@anthropic/mcp-filesystem"]
      }
    }
  };

  await writeFileIfNotExists(
    path.join(claudeDir, 'settings.json'),
    JSON.stringify(settings, null, 2),
    options.force
  );
}

// Fallback functions for when GitHub fetch fails
async function createLocalTemplates(cwd: string, options: InitOptions) {
  const githubDir = path.join(cwd, '.github');
  const workflowsDir = path.join(githubDir, 'workflows');
  const issueTemplateDir = path.join(githubDir, 'ISSUE_TEMPLATE');

  await fs.ensureDir(workflowsDir);
  await fs.ensureDir(issueTemplateDir);

  // Minimal CI workflow
  const ciYml = `name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run build
`;
  await writeFileIfNotExists(path.join(workflowsDir, 'ci.yml'), ciYml, options.force);

  await createLocalClaudeMd(cwd, options);
  await createClaudeConfig(cwd, options);

  console.log(chalk.green('\n✓ ローカルテンプレートで初期化完了'));
  console.log(chalk.yellow('  最新テンプレートを取得するには: gh auth login'));
}

async function createLocalClaudeMd(cwd: string, options: InitOptions) {
  const techStack = getTechStackForTemplate(options.template);
  const claudeMd = `# プロジェクト開発ルール

## 技術スタック
${techStack}

## Issue駆動開発

\`\`\`bash
gh issue list -l "ready-to-develop"
git checkout -b feature/issue-{番号}-{説明}
gh pr create --title "feat: {説明}" --body "closes #{番号}"
\`\`\`

## 品質基準 (DoD)
| レベル | カバレッジ |
|-------|-----------|
| Bronze | 80%+ |
| Silver | 85%+ |
| Gold | 95%+ |
`;
  await writeFileIfNotExists(path.join(cwd, 'CLAUDE.md'), claudeMd, options.force);
}

async function writeFileIfNotExists(filePath: string, content: string, force: boolean) {
  if (!force && await fs.pathExists(filePath)) {
    console.log(chalk.yellow(`  スキップ: ${path.basename(filePath)} (既に存在)`));
    return;
  }
  await fs.writeFile(filePath, content);
  console.log(chalk.green(`  作成: ${path.relative(process.cwd(), filePath)}`));
}
