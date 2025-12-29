# @prole-island/dev-tools

PROLE-ISLAND 統合開発ツール - v0生成、リポジトリ初期化、Claude Code設定

## インストール

```bash
npm install -g @prole-island/dev-tools
# or
npx @prole-island/dev-tools <command>
```

## コマンド一覧

### `prole init` - リポジトリ初期化

新規リポジトリに開発体制をセットアップ。

```bash
prole init
prole init --template storyblok  # Storyblokテンプレート
prole init --force               # 既存ファイルを上書き
```

**作成されるファイル:**
- `.github/workflows/ci.yml` - CI設定
- `.github/ISSUE_TEMPLATE/` - Issue/PRテンプレート
- `.github/dependabot.yml` - 依存関係更新
- `CLAUDE.md` - 開発ルール
- `.claude/settings.json` - Claude Code設定

---

### `prole v0` - v0 UI生成

v0.devでUIコンポーネントを生成。

```bash
# 基本
prole v0 "空状態コンポーネント作成。shadcn/ui使用、ダークモード対応"

# ファイル保存
prole v0 "ユーザーテーブル" --save src/components/user-table.tsx

# ブラウザでデモを開く
prole v0 "ログインフォーム" --open
```

**環境変数:**
```bash
export V0_API_KEY=your_key_here
# 取得: https://v0.dev/chat/settings/keys
```

**プロンプトのコツ:**
```
空状態コンポーネント作成。
- shadcn/uiのCard使用
- Tailwind CSS
- ダークモード対応
- 日本語テキスト
- アイコン: Users（Lucide、48px）
```

---

### `prole issue` - Issue管理

```bash
prole issue               # 開発可能なIssue一覧
prole issue --list        # 同上
prole issue --view 42     # Issue詳細表示
prole issue --create      # 新規Issue作成（ブラウザで開く）
```

---

### `prole claude` - Claude Code設定

```bash
prole claude              # 設定状況確認
prole claude --setup      # .claude/ 設定ファイル生成
prole claude --mcp github # MCPサーバー追加
```

---

## 開発フロー

```
1. prole init                    # リポジトリ初期化
2. prole issue                   # 開発可能Issue確認
3. git checkout -b feature/...   # ブランチ作成
4. prole v0 "プロンプト"          # UI生成
5. 開発・テスト
6. gh pr create                  # PR作成
```

---

## 環境変数

| 変数 | 説明 | 取得方法 |
|------|------|----------|
| `V0_API_KEY` | v0.dev APIキー | https://v0.dev/chat/settings/keys |

---

## 対応AIツール

このツールは以下のAIアシスタントと併用可能:

- Claude Code
- Cursor
- GitHub Copilot
- Windsurf
- その他のAIコーディングツール

---

## ライセンス

MIT
