import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface InitOptions {
  template: 'nextjs' | 'storyblok';
  force: boolean;
}

export async function initCommand(options: InitOptions) {
  const spinner = ora('リポジトリを初期化中...').start();
  const cwd = process.cwd();

  try {
    // 1. Create .github directory structure
    spinner.text = '.github/ を作成中...';
    await createGitHubStructure(cwd, options);

    // 2. Create CLAUDE.md
    spinner.text = 'CLAUDE.md を作成中...';
    await createClaudeMd(cwd, options);

    // 3. Create .claude directory
    spinner.text = '.claude/ を作成中...';
    await createClaudeConfig(cwd, options);

    spinner.succeed(chalk.green('リポジトリの初期化が完了しました！'));

    console.log(`
${chalk.cyan('作成されたファイル:')}
  - .github/workflows/ci.yml
  - .github/ISSUE_TEMPLATE/bug_report.yml
  - .github/ISSUE_TEMPLATE/feature_request.yml
  - .github/PULL_REQUEST_TEMPLATE.md
  - .github/dependabot.yml
  - CLAUDE.md
  - .claude/settings.json

${chalk.yellow('次のステップ:')}
  1. CLAUDE.md をプロジェクトに合わせて編集
  2. V0_API_KEY を環境変数に設定
  3. ${chalk.cyan('prole v0 "コンポーネント作成"')} でUI生成開始
`);
  } catch (error) {
    spinner.fail(chalk.red('初期化に失敗しました'));
    console.error(error);
    process.exit(1);
  }
}

async function createGitHubStructure(cwd: string, options: InitOptions) {
  const githubDir = path.join(cwd, '.github');
  const workflowsDir = path.join(githubDir, 'workflows');
  const issueTemplateDir = path.join(githubDir, 'ISSUE_TEMPLATE');

  await fs.ensureDir(workflowsDir);
  await fs.ensureDir(issueTemplateDir);

  // CI workflow
  const ciYml = `name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

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
      - run: npm run typecheck
      - run: npm run test --if-present
      - run: npm run build
`;

  await writeFileIfNotExists(path.join(workflowsDir, 'ci.yml'), ciYml, options.force);

  // Bug report template
  const bugReport = `name: Bug Report
description: バグの報告
title: "[Bug]: "
labels: ["bug", "needs-triage"]
body:
  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - P0: Critical (システム停止)
        - P1: High (主要機能に影響)
        - P2: Medium (機能に影響あるが回避可能)
        - P3: Low (軽微な問題)
    validations:
      required: true

  - type: textarea
    id: description
    attributes:
      label: バグの説明
      description: 何が起きているか簡潔に説明してください
    validations:
      required: true

  - type: textarea
    id: steps
    attributes:
      label: 再現手順
      description: バグを再現する手順
      value: |
        1.
        2.
        3.
    validations:
      required: true

  - type: textarea
    id: expected
    attributes:
      label: 期待される動作
    validations:
      required: true
`;

  await writeFileIfNotExists(path.join(issueTemplateDir, 'bug_report.yml'), bugReport, options.force);

  // Feature request template
  const featureRequest = `name: Feature Request
description: 新機能の提案
title: "[Enhancement]: "
labels: ["enhancement", "needs-triage"]
body:
  - type: dropdown
    id: priority
    attributes:
      label: Priority
      options:
        - P1: High
        - P2: Medium
        - P3: Low (Backlog)
    validations:
      required: true

  - type: dropdown
    id: dod-level
    attributes:
      label: DoD Level
      description: 品質レベル
      options:
        - Bronze (80% coverage - Prototype)
        - Silver (85% coverage - Development)
        - Gold (95% coverage - Production)
    validations:
      required: true

  - type: textarea
    id: background
    attributes:
      label: Background
      description: なぜこの機能が必要か
    validations:
      required: true

  - type: textarea
    id: description
    attributes:
      label: Feature Description
      description: 実装したい機能の説明
    validations:
      required: true

  - type: input
    id: figma-link
    attributes:
      label: Figma Mockup Link
      description: UI機能は必須。v0.devで生成した場合はそのURLでもOK

  - type: input
    id: v0-link
    attributes:
      label: v0 Generation Link (Optional)
      description: v0.devでUIを生成した場合のURL
`;

  await writeFileIfNotExists(path.join(issueTemplateDir, 'feature_request.yml'), featureRequest, options.force);

  // PR template
  const prTemplate = `## Summary
<!-- 変更内容を簡潔に説明 -->

## Changes
<!-- 変更点をリスト -->
-

## Test Plan
<!-- テスト方法 -->
- [ ]

## Related Issues
<!-- closes #番号 -->
`;

  await writeFileIfNotExists(path.join(githubDir, 'PULL_REQUEST_TEMPLATE.md'), prTemplate, options.force);

  // Dependabot
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

async function createClaudeMd(cwd: string, options: InitOptions) {
  const claudeMd = `# プロジェクト開発ルール

## 技術スタック
<!-- プロジェクトに合わせて編集 -->
- Next.js 15+ (App Router)
- TypeScript
- Tailwind CSS v4
- shadcn/ui

## 言語規約
- UI/コンテンツ: 日本語
- コード/コメント: 英語

---

## Issue駆動開発

### 開発開始時の必須手順

\`\`\`bash
# 1. 開発可能なIssue確認
gh issue list -l "ready-to-develop"

# 2. Issue詳細確認
gh issue view {番号}

# 3. ブランチ作成
git checkout -b feature/issue-{番号}-{説明}

# 4. 開発完了後PR作成
gh pr create --title "feat: {説明}" --body "closes #{番号}"
\`\`\`

---

## ラベル体系

| ラベル | 意味 |
|--------|------|
| \`ready-to-develop\` | 開発可能 |
| \`in-progress\` | 作業中 |
| \`design-review\` | デザインレビュー待ち |
| \`design-approved\` | デザイン承認済み |
| \`no-ui\` | UI変更なし |

---

## 品質基準 (DoD)

| レベル | カバレッジ | 用途 |
|-------|-----------|------|
| Bronze | 80%+ | プロトタイプ |
| Silver | 85%+ | 開発版 |
| Gold | 95%+ | 本番 |

---

## v0 + Figma ワークフロー

UI機能は以下のフローで開発:

1. 要件定義（プロンプト作成）
2. \`prole v0 "プロンプト"\` でUI生成
3. デモURLで確認
4. コードを取り込み、デザインシステムに適合
5. Issue作成（v0リンク添付）
6. 実装・PR

---

## コミット規則

\`\`\`
feat: 新機能
fix: バグ修正
docs: ドキュメント
refactor: リファクタリング
test: テスト
ci: CI/CD
chore: その他
\`\`\`
`;

  await writeFileIfNotExists(path.join(cwd, 'CLAUDE.md'), claudeMd, options.force);
}

async function createClaudeConfig(cwd: string, options: InitOptions) {
  const claudeDir = path.join(cwd, '.claude');
  await fs.ensureDir(claudeDir);

  const settings = {
    permissions: {
      allow: [
        "Bash(git:*)",
        "Bash(npm:*)",
        "Bash(gh:*)",
        "Read",
        "Write",
        "Edit"
      ]
    },
    env: {
      V0_API_KEY: "${V0_API_KEY}"
    }
  };

  await writeFileIfNotExists(
    path.join(claudeDir, 'settings.json'),
    JSON.stringify(settings, null, 2),
    options.force
  );
}

async function writeFileIfNotExists(filePath: string, content: string, force: boolean) {
  if (!force && await fs.pathExists(filePath)) {
    console.log(chalk.yellow(`  スキップ: ${path.basename(filePath)} (既に存在)`));
    return;
  }
  await fs.writeFile(filePath, content);
  console.log(chalk.green(`  作成: ${path.relative(process.cwd(), filePath)}`));
}
