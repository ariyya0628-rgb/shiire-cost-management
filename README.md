# 仕入原価管理システム

## 概要

店舗仕入れ・ネット仕入れの商品について、仕入日・店舗・商品名・金額・商品写真・レシート写真を記録し、後日商品が売れた際に正確な仕入原価を確認できるようにするシステムです。

## 解決したい問題

- 売れた時に仕入値が分からない
- 同じ商品でも毎回仕入値が異なる
- レシートに商品名が出ない店舗がある
- クレジットカード明細だけでは商品が特定できない
- 商品写真、レシート、メモがバラバラになる

## 基本構成

第1段階では、Googleフォーム・Googleスプレッドシート・Google Apps Scriptを使って、仕入記録を残す最小構成を作ります。

第2段階で、商品写真AI解析やレシートOCRを追加します。

第3段階で、楽天・Amazon・メルカリ等の売上データと紐付け、利益計算に使える状態を目指します。

## 推奨フォルダ構成

```text
仕入原価管理システム/
├─ AGENTS.md
├─ README.md
├─ apps-script/
│  ├─ Code.gs
│  └─ appsscript.json
├─ tests/
│  └─ gasLogic.test.js
└─ docs/
   ├─ user_manual.md
   ├─ setup_guide.md
   └─ development_spec.md
```

## 第1段階の実装

第1段階として、Googleフォームから仕入登録し、Googleスプレッドシートの仕入DBへ自動転記する Apps Script を追加しています。

- Apps Script 本体: `apps-script/Code.gs`
- Apps Script 設定: `apps-script/appsscript.json`
- セットアップ手順: `docs/setup_guide.md`
- 第三者向けの総合手順書: `docs/user_manual.md`

初回は Apps Script で `setupPurchaseCostSystem` を実行してください。フォーム、仕入DB、未確認リスト、日別集計、店舗別集計、支払方法別集計が作成されます。

## 初めて見る人向け

このプロジェクトを初めて見る人は、まず `docs/user_manual.md` を読んでください。

システムの目的、初回セットアップ、日常の入力方法、スプレッドシートの見方、トラブル対応までまとめています。

## Codexへの初回指示

```text
このフォルダで「仕入原価管理システム」を作成してください。

まず AGENTS.md と docs/development_spec.md を読み、仕様に沿って第1段階を実装してください。

最優先は以下です。

1. Googleフォームで仕入登録できる設計
2. フォーム回答を仕入DBへ整形するGoogle Apps Script
3. 仕入IDの自動採番
4. 商品写真・レシート写真URLの保存
5. 未確認リスト作成
6. 日別・店舗別・支払方法別の集計

AI画像解析、レシートOCR、売上データ連携は第2段階以降でよいので、まずは確実に使える最小構成を完成させてください。

削除や既存データ破壊を伴う作業以外は、確認待ちせず合理的に判断して進めてください。
```
