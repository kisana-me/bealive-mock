# bealive-mock

サービス終了した [BeAlive.](https://github.com/kisana-me/bealive) を、静的コンテンツとして
一般公開するためのモックです。Cloudflare Workers の静的アセットとして配信し、
Worker スクリプトを持たないためリクエスト数の枠を消費しません。

HTML / CSS は bealive 本体の ERB とスタイルシートをそのまま静的化しており、
seed (30 件のキャプチャーと初期アカウント `@kisana`) の内容を表示します。

## ページ

| パス | 元のビュー |
| --- | --- |
| `/` | `pages/index.html.erb` (サインアウト時) — 公開タイムライン 30 件 |
| `/captures/<aid>` | `captures/show.html.erb` — 30 ページ |
| `/@kisana` | `accounts/show.html.erb` (サインアウト時) — タイムライン 30 件 |

本体は 10 件ずつ追加読み込みしますが、モックでは 30 件を一度に並べ、
「さらに読み込む」ボタンの位置に `captures/_load_end.html.erb` と同じ
「すべてを読み込み終わりました」を出しています。

## サービス終了の扱い

- トップページの「BeAlive. / いつもの日常を相互確認。 / 続ける」の下に、
  赤ボーダーで囲ったサービス終了のお知らせを置いています。
- サインイン・撮影・フォローなど動作しなくなったリンクとボタンには
  `data-service-ended` を付けており、押すと画面内トーストで
  「BeAlive. はサービス終了しました 詳しくはこちら」を表示します。
  「詳しくはこちら」からトップページのお知らせに遷移します。
- 利用規約・プライバシーポリシー・お問い合わせは `anyur.com` の同じパスに向けています。

## 構成

```
data/site.json   アカウントと 30 件のキャプチャー (aid・撮影日時・画像パス)
tools/build.mjs  data/site.json から public/**/index.html を生成する
tools/prepare-images.py
                 bealive の db/seed_images から本番と同じ画像バリアントを作る
public/          Cloudflare Workers に配信させるディレクトリ (生成物もコミット済み)
```

## ビルド

依存パッケージはありません。

```sh
# ページの生成 (data/site.json を変更したら実行する)
node tools/build.mjs

# 画像バリアントの生成 (初回のみ実施済み。Pillow が必要)
python3 tools/prepare-images.py ../bealive/src/db/seed_images
```

`public/images/variants/capture-*.webp` は bealive の seed 画像を、本番の
`bealive_capture` バリアント (`1500x2000` 中央切り抜き・WebP quality 80) と
同じ条件で書き出したものです。`account-kisana-icon.webp` は本番のアイコンを
そのまま持ってきています。

### キャプチャーの aid

`data/site.json` の `captures[].aid` が詳細ページのパスになります。
本番 (bealive.amiverse.net) の公開タイムラインから取得した実際の aid が入っているので、
`/captures/<aid>` は本番と同じ URL のままです。

seed の連番と本番のレコードは撮影日時 (`15:00` + 連番の分) で対応するため、
画像もその対応で紐付けています。`aid` を変更した場合は
`node tools/build.mjs` を再実行してください (古い `public/captures/<aid>.html` は削除)。

## デプロイ

```sh
npx wrangler deploy
```

`not_found_handling` は `none` のため、存在しないパスは本文なしの 404 を返します。

`/` と `/captures/<aid>` は本体と同じ URL のままリダイレクトなしで配信されます。
`/@kisana` は Workers の静的アセット配信が `@` を正規化するため、
`/%40kisana` へ 307 リダイレクトされたうえで表示されます (本体と同じ URL のままでも到達可能)。

## ローカル確認

```sh
npx wrangler dev
```
