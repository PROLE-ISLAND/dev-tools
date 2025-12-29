import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface V0Options {
  save?: string;
  open: boolean;
  template?: string;
  listTemplates: boolean;
}

interface V0Response {
  id: string;
  webUrl: string;
  latestVersion?: {
    demoUrl: string;
    files: Array<{
      name: string;
      content: string;
    }>;
  };
}

interface V0Template {
  name: string;
  description: string;
  basePrompt: string;
}

const TEMPLATES: Record<string, { description: string; example: string }> = {
  'base': { description: '汎用コンポーネント', example: 'プロフィールカード' },
  'form': { description: '入力フォーム', example: 'ユーザー登録フォーム' },
  'table': { description: 'データテーブル', example: 'ユーザー一覧テーブル' },
  'card': { description: 'カードコンポーネント', example: 'ダッシュボードカード' },
  'dashboard': { description: 'ダッシュボード', example: '管理画面ダッシュボード' },
  'empty-state': { description: '空状態表示', example: '検索結果なし表示' },
};

export async function v0Command(prompt: string | undefined, options: V0Options) {
  // List available templates
  if (options.listTemplates) {
    await listTemplates();
    return;
  }

  // If no prompt, show interactive mode or help
  if (!prompt) {
    showHelp();
    return;
  }

  const apiKey = process.env.V0_API_KEY;
  if (!apiKey) {
    console.error(chalk.red('エラー: V0_API_KEY が設定されていません'));
    console.log(`
${chalk.yellow('設定方法:')}
  1. https://v0.dev/chat/settings/keys でAPIキーを取得
  2. export V0_API_KEY=your_key_here
`);
    process.exit(1);
  }

  // If template is specified, fetch and merge with prompt
  let finalPrompt = prompt;
  if (options.template) {
    const spinner = ora(`テンプレート「${options.template}」を取得中...`).start();
    try {
      const templateContent = await fetchTemplate(options.template);
      if (templateContent) {
        finalPrompt = mergePromptWithTemplate(prompt, templateContent);
        spinner.succeed(chalk.green(`テンプレート「${options.template}」を適用`));
      } else {
        spinner.warn(chalk.yellow(`テンプレート「${options.template}」が見つかりません。プロンプトをそのまま使用します。`));
      }
    } catch (error) {
      spinner.warn(chalk.yellow('テンプレート取得に失敗。プロンプトをそのまま使用します。'));
    }
  }

  const spinner = ora('v0.devでUI生成中...').start();

  try {
    const response = await callV0Api(apiKey, finalPrompt);

    spinner.succeed(chalk.green('生成完了！'));

    // Display results
    console.log(`
${chalk.cyan('📱 Demo:')}  ${response.latestVersion?.demoUrl || 'N/A'}
${chalk.cyan('💬 Chat:')}  ${response.webUrl}
`);

    // Display generated files
    const files = response.latestVersion?.files || [];
    const componentFiles = files.filter(f =>
      f.name.endsWith('.tsx') && !f.name.includes('page.tsx')
    );

    if (componentFiles.length > 0) {
      console.log(chalk.cyan('📁 生成されたコンポーネント:'));
      componentFiles.forEach(f => {
        console.log(`   - ${f.name}`);
      });
    }

    // Save to file if requested
    if (options.save && componentFiles.length > 0) {
      const mainComponent = componentFiles[0];
      await fs.ensureDir(options.save.split('/').slice(0, -1).join('/') || '.');
      await fs.writeFile(options.save, mainComponent.content);
      console.log(chalk.green(`\n💾 保存: ${options.save}`));
    }

    // Open in browser if requested
    if (options.open && response.latestVersion?.demoUrl) {
      await execAsync(`open "${response.latestVersion.demoUrl}"`);
    }

    // Show code preview
    if (componentFiles.length > 0 && !options.save) {
      console.log(chalk.cyan('\n📝 コードプレビュー:'));
      console.log(chalk.gray('─'.repeat(60)));
      const preview = componentFiles[0].content.split('\n').slice(0, 20).join('\n');
      console.log(preview);
      if (componentFiles[0].content.split('\n').length > 20) {
        console.log(chalk.gray('... (省略)'));
      }
      console.log(chalk.gray('─'.repeat(60)));
      console.log(`\n${chalk.yellow('保存するには:')} prole v0 "${prompt.slice(0, 30)}..." --save component.tsx`);
    }

  } catch (error) {
    spinner.fail(chalk.red('生成に失敗しました'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
${chalk.cyan('v0 UI Generation')}

${chalk.yellow('使い方:')}
  prole v0 "空状態コンポーネント作成"
  prole v0 "ユーザーテーブル" --save components/user-table.tsx
  prole v0 "ログインフォーム" --template form
  prole v0 "ログインフォーム" --open

${chalk.yellow('オプション:')}
  --template, -t    テンプレートを使用（form, table, card, empty-state等）
  --list-templates  利用可能なテンプレート一覧
  --save <path>     生成コードをファイルに保存
  --open            ブラウザでデモを開く

${chalk.yellow('テンプレート使用例:')}
  prole v0 "ユーザー登録" --template form
  prole v0 "候補者一覧" --template table
  prole v0 "データなし表示" --template empty-state

${chalk.yellow('プロンプトのコツ:')}
  - 具体的に: コンポーネント名、機能、レイアウトを詳細に
  - テンプレート使用時: 要件のみ記載（技術スタックは自動追加）

${chalk.yellow('環境変数:')}
  V0_API_KEY: v0.dev APIキー (https://v0.dev/chat/settings/keys)

${chalk.cyan('テンプレート一覧を表示:')} prole v0 --list-templates
`);
}

async function listTemplates() {
  console.log(chalk.cyan('\n📋 利用可能なテンプレート:\n'));

  // Try to fetch from org repo first
  try {
    const { stdout } = await execAsync(
      `gh api repos/PROLE-ISLAND/.github/contents/v0-templates --jq '.[].name' 2>/dev/null`
    );
    const remoteTemplates = stdout.trim().split('\n').filter(f => f.endsWith('.md') && f !== 'README.md');

    console.log(chalk.gray('  PROLE-ISLAND/.github/v0-templates から取得:\n'));

    for (const file of remoteTemplates) {
      const name = file.replace('.md', '');
      const info = TEMPLATES[name] || { description: 'カスタムテンプレート', example: '-' };
      console.log(`  ${chalk.green(name.padEnd(15))} ${info.description}`);
      console.log(`  ${' '.repeat(15)} ${chalk.gray(`例: prole v0 "${info.example}" --template ${name}`)}\n`);
    }
  } catch {
    // Fallback to local list
    console.log(chalk.gray('  ローカルテンプレート一覧:\n'));
    for (const [name, info] of Object.entries(TEMPLATES)) {
      console.log(`  ${chalk.green(name.padEnd(15))} ${info.description}`);
      console.log(`  ${' '.repeat(15)} ${chalk.gray(`例: prole v0 "${info.example}" --template ${name}`)}\n`);
    }
  }
}

async function fetchTemplate(templateName: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `gh api repos/PROLE-ISLAND/.github/contents/v0-templates/${templateName}.md --jq '.content' | base64 -d`
    );
    return stdout;
  } catch {
    return null;
  }
}

function mergePromptWithTemplate(userPrompt: string, templateContent: string): string {
  // Extract the template section from the markdown
  const templateMatch = templateContent.match(/```\n([\s\S]*?)```/);
  if (!templateMatch) {
    // If no template block found, just prepend technical requirements
    return `${userPrompt}

技術要件:
- shadcn/uiコンポーネント使用
- Tailwind CSS
- ダークモード対応（dark:クラス使用）
- 日本語テキスト
- TypeScript対応`;
  }

  const baseTemplate = templateMatch[1];

  // Replace placeholder with user's prompt
  const merged = baseTemplate
    .replace(/\{コンポーネント名\}/g, userPrompt)
    .replace(/\{フォーム名\}/g, userPrompt)
    .replace(/\{コンテキスト\}/g, userPrompt)
    .replace(/- \{機能1\}\n- \{機能2\}\n- \{機能3\}/g, `- ${userPrompt}の主要機能`)
    .replace(/- \{レイアウト\}\n- \{配色（CSS変数使用）\}/g, '- モダンなレイアウト\n- CSS変数による配色')
    .replace(/\{[^}]+\}/g, userPrompt); // Fallback for any remaining placeholders

  return merged.replace(/「|」/g, '');
}

async function callV0Api(apiKey: string, prompt: string): Promise<V0Response> {
  const response = await fetch('https://api.v0.dev/v1/chats', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: prompt }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  return response.json();
}
