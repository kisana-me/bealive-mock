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
| `/404` | `errors/404.html.erb` — 存在しないパスで返す (`request_id` は省略) |

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

## 本体との違い

静的化にあたって変えているのは次の点だけです。

- Turbo / Stimulus は載せず、メニュー開閉とトーストのみを素の JS で実装 (マークアップは本体のまま)
- `<meta charset="utf-8">` を追加 (本体は Rails が Content-Type ヘッダで返している)
- `robots` は全ページ `index, follow, archive` (本体はトップページ以外 `noindex`)。
  404 ページのみ `noindex, nofollow, noarchive`
- `og:image` は 1200x675 の JPEG (約 15KB)。本体が指す
  `/statics/images/bealive-1.png` は本番でも 404 で、元画像は 3840x2160 の 3.3MB だった
- タイムラインのカード画像のみ `loading="lazy"` を追加 (30 件を一度に並べるため)
- csrf/csp メタタグと importmap は省略。GA4 は本体と同じタグを全ページに入れている
  (本体は production のみ。ID は `data/site.json` の `ga4_id`)

## 構成

```
data/site.json   アカウント・30 件のキャプチャー (aid・撮影日時・画像パス)・GA4 の ID
tools/build.mjs  data/site.json から public/**.html を生成する
tools/prepare-images.py
                 bealive のアセットから配信用の画像を作る
public/          Cloudflare Workers に配信させるディレクトリ (生成物もコミット済み)
wrangler.jsonc   静的アセットのみの Worker 設定
```

## ビルド

依存パッケージはありません。

```sh
# ページの生成 (data/site.json を変更したら実行する)
node tools/build.mjs

# 画像の生成 (初回のみ実施済み。Pillow が必要)
python3 tools/prepare-images.py ../bealive/src
```

`public/images/variants/capture-*.webp` は bealive の seed 画像を、本番の
`bealive_capture` バリアント (`1500x2000` 中央切り抜き・WebP quality 80) と
同じ条件で書き出したものです。`account-kisana-icon.webp` は本番のアイコンを
そのまま持ってきています。`static_assets/images/bealive-1-og.jpg` は
og:image 用に元画像 (3840x2160 / 3.3MB) を 1200x675 / 約 15KB に縮小したものです。

### キャプチャーの aid

`data/site.json` の `captures[].aid` が詳細ページのパスになります。
本番 (bealive.amiverse.net) の公開タイムラインから取得した実際の aid が入っているので、
`/captures/<aid>` は本番と同じ URL のままです。

seed の連番と本番のレコードは撮影日時 (`15:00` + 連番の分) で対応するため、
画像もその対応で紐付けています。`aid` を変更した場合は
`node tools/build.mjs` を再実行してください (古い `public/captures/<aid>.html` は削除)。

## Cloudflare へのデプロイ

`wrangler.jsonc` は `main` (Worker スクリプト) を持たない静的アセットのみの設定です。
静的アセットへのリクエストは Workers のリクエスト数にカウントされません。

```sh
# 1. Cloudflare アカウントにログイン (ブラウザが開く)
npx wrangler login

# 2. ローカルで確認 (実際の Workers ランタイムで配信される)
npx wrangler dev

# 3. デプロイ
npx wrangler deploy
```

デプロイすると `https://bealive-mock.<サブドメイン>.workers.dev` で公開されます。

### 独自ドメイン (bealive.amiverse.net) で配信する

Rails のホスティングを置き換える場合は、デプロイ後に Cloudflare ダッシュボードの
Workers & Pages → bealive-mock → Settings → Domains & Routes で
Custom Domain として `bealive.amiverse.net` を追加します。
DNS レコードは Cloudflare が自動で張り替えるので、既存の A / CNAME は先に消しておきます。

`wrangler.jsonc` に書いておく場合は次を足します (`zone_name` は対象のゾーン)。

```jsonc
"routes": [
  { "pattern": "bealive.amiverse.net", "custom_domain": true }
]
```

### URL について

`/`・`/captures/<aid>`・`/404` は本体と同じ URL のままリダイレクトなしで配信されます。
`/@kisana` は Workers の静的アセット配信が `@` を正規化するため、
`/%40kisana` へ 307 リダイレクトされたうえで表示されます (本体と同じ URL のままでも到達可能)。

存在しないパスは `public/404.html` を 404 ステータスで返します。
