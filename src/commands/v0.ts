import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface V0Options {
  save?: string;
  open: boolean;
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

export async function v0Command(prompt: string | undefined, options: V0Options) {
  // If no prompt, show interactive mode or help
  if (!prompt) {
    console.log(`
${chalk.cyan('v0 UI Generation')}

${chalk.yellow('使い方:')}
  prole v0 "空状態コンポーネント作成。shadcn/ui使用、ダークモード対応"
  prole v0 "ユーザーテーブル" --save components/user-table.tsx
  prole v0 "ログインフォーム" --open

${chalk.yellow('プロンプトのコツ:')}
  - 必ず含める: shadcn/ui使用、Tailwind CSS、ダークモード対応
  - 日本語UI: 「日本語テキスト」を明記
  - 具体的に: コンポーネント名、機能、レイアウトを詳細に

${chalk.yellow('環境変数:')}
  V0_API_KEY: v0.dev APIキー (https://v0.dev/chat/settings/keys)
`);
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

  const spinner = ora('v0.devでUI生成中...').start();

  try {
    const response = await callV0Api(apiKey, prompt);

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
