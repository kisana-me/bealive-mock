#!/usr/bin/env node
// data/site.json から public/ 以下の静的ページを書き出す。
//
// HTML は bealive (Rails) の ERB をそのまま静的化したもの。
//   - layouts/application.html.erb  -> layout()
//   - pages/index.html.erb          -> トップページ (サインアウト時の分岐)
//   - captures/_capture.html.erb    -> captureCard()
//   - captures/_load_end.html.erb   -> 「すべてを読み込み終わりました」
//   - captures/show.html.erb        -> キャプチャー詳細 (30 件)
//   - accounts/show.html.erb        -> アカウントページ (サインアウト時の分岐)
//   - errors/404.html.erb           -> 404 ページ (request_id は静的化により省略)
//
// サービス終了により動作しないリンク・ボタンには data-service-ended を付け、
// public/assets/application.js がトースト通知に差し替える。

import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const publicDir = join(root, "public")

const site = JSON.parse(await readFile(join(root, "data", "site.json"), "utf8"))
const { origin, ga4_id: ga4Id, account, captures } = site

// ---- ヘルパー ----

// ApplicationHelper#full_title
const fullTitle = (title) => (title ? `${title} | BeAlive.` : "BeAlive.")

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

// captured_at.strftime("%m月 %d日 %k時 %M分")
const capturedAtLabel = (capturedAt) => {
  const [, month, day, hour, minute] = capturedAt.match(
    /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
  )
  return `${month}月 ${day}日 ${hour}時 ${minute}分`
}

const accountPath = `/@${account.name_id}`
const capturePath = (capture) => `/captures/${capture.aid}`

// ---- レイアウト ----

// layouts/application.html.erb の Google タグ相当。本体は production のみで出す。
const ga4Tag = ga4Id
  ? `
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-${ga4Id}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag("js", new Date());
      gtag("config", "G-${ga4Id}");
    </script>`
  : ""

// layouts/application.html.erb 相当。csrf/csp と importmap は静的化により省いている。
// robots は本体だとトップページ以外 noindex だが、静的アーカイブとして公開するため
// 全ページ index, follow, archive にしている。
const layout = ({ title, robots = "index, follow, archive", body }) => `<!DOCTYPE html>
<html lang="ja">
  <head>
    <!-- 本体は Rails が Content-Type ヘッダで charset を返すが、静的配信では明示しておく -->
    <meta charset="utf-8">
    <title>${escapeHtml(fullTitle(title))}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="${robots}">
    <meta property="og:title" content="${escapeHtml(fullTitle(title))}">
    <meta property="og:description" content="BeAlive. いつもの日常を相互確認。">
    <meta property="og:type" content="website">
    <meta property="og:image" content="${origin}/static_assets/images/bealive-1-og.jpg">
    <meta name="twitter:card" content="summary_large_image" />
    <meta http-equiv="content-language" content="ja">
    <link rel="icon" href="/favicon.ico">
    <link rel="stylesheet" href="/assets/application.css">
    <script src="/assets/application.js" defer></script>${ga4Tag}
  </head>

  <body>
    <header>
      <div class="bealive-logo"><a href="/">BeAlive.</a></div>
      <div class="header-menu" data-controller="menu">
        <button data-action="click->menu#toggle" class="hamburger-menu">&#9776;</button>
        <nav data-menu-target="nav" class="menu">
          <button data-action="click->menu#toggle" class="close-menu">&times;</button>
          <div class="bealive-logo"><a href="/">BeAlive.</a></div>
          <ul class="header-menu-account">
            <li><a href="/sessions/start" data-service-ended>続ける</a></li>
          </ul>
          <ul class="header-menu-general">
            <li><a href="https://anyur.com/terms-of-service">利用規約</a></li>
            <li><a href="https://anyur.com/privacy-policy">プライバシーポリシー</a></li>
            <li><a href="https://anyur.com/contact">お問い合わせ</a></li>
            <li><a href="/">BeAlive.</a></li>
          </ul>
          <div class="bealive-copylight">© BeAlive. 2025</div>
        </nav>
      </div>
    </header>
    <main>
${body}
    </main>
    <footer>
      <ul>
        <li><a href="https://anyur.com/terms-of-service">利用規約</a></li>
        <li><a href="https://anyur.com/privacy-policy">プライバシーポリシー</a></li>
        <li><a href="https://anyur.com/contact">お問い合わせ</a></li>
        <li><a href="/">BeAlive.</a></li>
      </ul>
      <div class="bealive-copylight">© BeAlive. 2025</div>
    </footer>
    <div class="toast" data-toast>
      BeAlive. はサービス終了しました <a href="/">詳しくはこちら</a>
    </div>
  </body>
</html>
`

// ---- パーシャル ----

// captures/_capture.html.erb 相当 (show_comment: true)。
// seed のキャプチャーはコメントが空なので、本番と同じく空の要素だけが出る。
// タイムラインでは 30 件を一度に並べるため、カード画像のみ loading="lazy" を付けている。
const captureCard = (capture) => `      <div class="capture-wrap">
        <a href="${capturePath(capture)}">
          <div class="capture">

            <div class="capture-person">
              <div class="capture-nameplate">
                <img class="capture-icon" src="${account.icon_url}" />
                <strong>${escapeHtml(account.name)}</strong>がリクエスト
              </div>
              <div class="capture-minicomment">
              </div>
            </div>

            <div class="capture-person">
              <div class="capture-nameplate">
                <img class="capture-icon" src="${account.icon_url}" />
                <strong>${escapeHtml(account.name)}</strong>が撮影
              </div>
              <div class="capture-minicomment">
              </div>
            </div>

            <div class="capture-image">
              <img class="front-image" src="${capture.main_photo}" loading="lazy" />
              <img class="back-image" src="${capture.sub_photo}" loading="lazy" />
            </div>

            <div class="capture-info">
              <div class="capture-visibility">
                公開
              </div>
              <div class="capture-time">
                ${capturedAtLabel(capture.captured_at)}に撮影
              </div>
            </div>

          </div>
        </a>
      </div>`

// captures/_load_end.html.erb 相当。
// 本来は「さらに読み込む」ボタンだが、30 件すべてを出しているので読み込み完了の表示にしている。
const loadEnd = `      <div id="load-more">
        <div>すべてを読み込み終わりました</div>
      </div>`

const timeline = (list) => `      <div id="captures">
${list.map(captureCard).join("\n")}
      </div>
${loadEnd}`

// ---- ページ ----

// pages/index.html.erb 相当 (@current_account が nil のとき)。
// 公開タイムラインは captured_at の降順。
const indexPage = () => {
  const list = [...captures].sort((a, b) =>
    a.captured_at < b.captured_at ? 1 : -1
  )
  return layout({
    title: null,
    body: `      <h1>BeAlive.</h1>
      <p>いつもの日常を相互確認。</p>
      <div>
        <a class="pages-link-button" href="/sessions/start" data-service-ended>続ける</a>
      </div>

      <div class="service-ended">
        <p><strong>BeAlive. はサービスを終了しました。</strong></p>
        <p>2026/07/29をもってすべてのサービスを終了し、現在はサンプルのキャプチャーを閲覧できる静的なアーカイブとして公開しています。</p>
        <p>これまでと同様に、アプリケーションのソースコードは<a href="https://github.com/kisana-me/bealive" target="_blank" rel="noopener noreferrer">GitHubにて公開</a>しています。</p>
        <p>閲覧以外の操作 (サインイン、撮影、フォローなど) はご利用いただけません。ご利用ありがとうございました。</p>
      </div>

      <h1>みんなのキャプチャー</h1>
      <div>
${timeline(list)}
      </div>`,
  })
}

// captures/show.html.erb 相当。
// 撮影済み・所有者ではないため、capture-controll には何も出ない。
// sender_comment / receiver_comment は空なのでコメントボックスも出ない。
const capturePage = (capture) =>
  layout({
    title: "みる",
    body: `      <h1>みる</h1>

      <div class="capture">

        <div class="capture-person">
          <div class="capture-nameplate">
            <img class="capture-icon" src="${account.icon_url}" />
            <a href="${accountPath}">${escapeHtml(account.name)}</a>がリクエスト
          </div>
        </div>

        <div class="capture-person">
          <div class="capture-nameplate">
            <img class="capture-icon" src="${account.icon_url}" />
            <a href="${accountPath}">${escapeHtml(account.name)}</a>が撮影
          </div>
        </div>

        <div class="capture-image">
          <img class="front-image" src="${capture.main_photo}" />
          <img class="back-image" src="${capture.sub_photo}" />
        </div>

        <div class="capture-info">
          <div class="capture-visibility">
            公開
          </div>
          <div class="capture-time">
            ${capturedAtLabel(capture.captured_at)}に撮影
          </div>
        </div>

        <div class="capture-controll">
        </div>

        <div class="capture-commentbox">
          <p>コメントはそのうち実装</p>
        </div>
      </div>

      <br />
      <br />
      <br />`,
  })

// accounts/show.html.erb 相当 (@current_account が nil のとき)。
// 一覧の並びは本番と同じく明示的な order なし = 作成順。
const accountPage = () =>
  layout({
    title: `${account.name}さん`,
    body: `      <div>
        <img class="account-icon" src="${account.icon_url}" />
      </div>

      <div>
        ${escapeHtml(account.name)}
      </div>

      <div>
        @${escapeHtml(account.name_id)}
      </div>

      <p>
        <strong>自己紹介:</strong>
        ${escapeHtml(account.description)}
      </p>

      <p>
        <strong>フォロー:</strong>
        <a href="${accountPath}/following" data-service-ended>${account.following_count}</a>
      </p>

      <p>
        <strong>フォロワー:</strong>
        <a href="${accountPath}/followers" data-service-ended>${account.followers_count}</a>
      </p>

      <p>
        <strong>操作:</strong>
        <a href="/sessions/start" data-service-ended>サインインしてフォロー</a>
      </p>

      <hr />

      <div>
${timeline(captures)}
      </div>`,
  })

// errors/404.html.erb 相当。request_id は静的配信では出せないので省いている。
// 存在しないパスなのでここだけ noindex にしている。
const notFoundPage = () =>
  layout({
    title: "Not Found - 404",
    robots: "noindex, nofollow, noarchive",
    body: `      <h1>Not Found - 404</h1>
      <p>お探しのページは存在しません。</p>
      <a href="/">トップへ</a>`,
  })

// ---- 書き出し ----

// wrangler.jsonc の html_handling: auto-trailing-slash では、/foo は /foo.html を
// そのまま返す (/foo/index.html だと /foo/ へリダイレクトされる)。
// 本体と同じ URL をリダイレクトなしで配信するため、拡張子つきで書き出す。
const write = async (path, html) => {
  const file = join(publicDir, path === "" ? "index.html" : `${path}.html`)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, html)
  return path === "" ? "/" : `/${path}`
}

const written = [await write("", indexPage())]
for (const capture of captures) {
  written.push(await write(`captures/${capture.aid}`, capturePage(capture)))
}
written.push(await write(`@${account.name_id}`, accountPage()))
// wrangler.jsonc の not_found_handling: 404-page が参照する
written.push(await write("404", notFoundPage()))

console.log(`wrote ${written.length} pages:`)
for (const path of written) console.log(`  ${path}`)
