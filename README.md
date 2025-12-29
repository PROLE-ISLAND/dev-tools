# @prole-island/dev-tools

[![npm version](https://badge.fury.io/js/@prole-island%2Fdev-tools.svg)](https://www.npmjs.com/package/@prole-island/dev-tools)
[![CI](https://github.com/PROLE-ISLAND/dev-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/PROLE-ISLAND/dev-tools/actions/workflows/ci.yml)

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
prole init                          # 基本初期化
prole init --template storyblok     # Storyblokテンプレート
prole init --template library       # ライブラリ用テンプレート
prole init --all-workflows          # 全ワークフロー適用
prole init --workflows ci,v0-generate  # ワークフロー指定
prole init --force                  # 既存ファイルを上書き
```

**作成されるファイル:**
- `.github/workflows/` - CI/CD設定（テンプレート別に自動選択）
- `.github/ISSUE_TEMPLATE/` - Issue/PRテンプレート
- `.github/dependabot.yml` - 依存関係更新
- `CLAUDE.md` - 開発ルール（組織共通 + プロジェクト固有）
- `.claude/settings.json` - Claude Code設定（MCPサーバー含む）

---

### `prole v0` - v0 UI生成

v0.devでUIコンポーネントを生成。**テンプレート機能対応！**

```bash
# 基本
prole v0 "空状態コンポーネント作成"

# テンプレート使用（推奨）
prole v0 "ユーザー登録" --template form
prole v0 "候補者一覧" --template table
prole v0 "データなし表示" --template empty-state

# ファイル保存
prole v0 "ユーザーテーブル" --save src/components/user-table.tsx

# ブラウザでデモを開く
prole v0 "ログインフォーム" --open

# テンプレート一覧表示
prole v0 --list-templates
```

**利用可能なテンプレート:**
| テンプレート | 説明 |
|-------------|------|
| `base` | 汎用コンポーネント |
| `form` | 入力フォーム（react-hook-form + zod） |
| `table` | データテーブル |
| `card` | カードコンポーネント |
| `dashboard` | ダッシュボード |
| `empty-state` | 空状態表示 |

**環境変数:**
```bash
export V0_API_KEY=your_key_here
# 取得: https://v0.dev/chat/settings/keys
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

### `prole sync` - テンプレート同期

既存リポジトリのテンプレートを最新版に更新。

```bash
prole sync              # テンプレートを最新化
prole sync --dry-run    # 変更内容をプレビュー
prole sync --force      # 既存ファイルを強制上書き
```

**動作:**
- PROLE-ISLAND/.github から最新テンプレートを取得
- ISSUE_TEMPLATE, workflows を更新
- CLAUDE.md の組織共通セクションのみ更新（プロジェクト固有部分は保持）

---

### `prole validate` - 設定検証 🆕

リポジトリが組織標準に準拠しているか検証。

```bash
prole validate           # 設定を検証
prole validate --verbose # 詳細表示
prole validate --fix     # 問題を自動修正（prole sync を実行）
```

**検証項目:**
- CLAUDE.md の存在と組織テンプレート同期
- .claude/settings.json の設定
- .github/ 構造（Issue/PRテンプレート、Dependabot）
- CIワークフローの存在
- 組織テンプレートとの同期状態

**出力例:**
```
📋 検証結果:

✅ CLAUDE.md - 組織テンプレートと同期済み
✅ .claude/settings.json - 設定OK
✅ .github/ISSUE_TEMPLATE/ - 2個のテンプレート
⚠️ CI ワークフロー - CIワークフローがありません

📊 サマリー:
   ✅ Pass: 3  ⚠️ Warn: 1  ❌ Fail: 0

統一度スコア: 75%
```

---

## 開発フロー

```
1. prole init                    # リポジトリ初期化
2. prole validate                # 設定検証
3. prole issue                   # 開発可能Issue確認
4. git checkout -b feature/...   # ブランチ作成
5. prole v0 "プロンプト" -t form # UI生成
6. 開発・テスト
7. gh pr create                  # PR作成
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

## 変更履歴

### v0.2.0
- `prole v0 --template` でv0-templates統合
- `prole v0 --list-templates` でテンプレート一覧
- `prole init --workflows` でワークフロー指定
- `prole init --all-workflows` で全ワークフロー
- `prole validate` コマンド追加（設定検証）
- `.claude/settings.json` にMCPサーバー標準設定追加

### v0.1.0
- 初回リリース

---

## ライセンス

MIT
