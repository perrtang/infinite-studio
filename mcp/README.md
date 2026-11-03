# Infinite Studio MCP

本機 MCP 讓支援標準 MCP 的 Codex 或 Claude 與工作檔互動。需要 Node.js 22 或更新版本；在包含 `mcp/` 的 Infinite Studio 資料夾執行一次 `npm ci --prefix mcp`。

## 目前開啟的線上畫布

以 stdio MCP 設定啟動 `node`，參數為 `/絕對路徑/mcp/server.mjs --live`。例如 Codex 的 `~/.codex/config.toml`：

```toml
[mcp_servers.infinite_studio]
command = "node"
args = ["/絕對路徑/mcp/server.mjs", "--live"]
```

Claude 的 MCP 設定使用同一個命令與參數，例如：

```json
{"mcpServers":{"infinite_studio":{"command":"node","args":["/絕對路徑/mcp/server.mjs","--live"]}}}
```

重新載入 MCP 設定後，請 AI 執行 `pair_canvas`，將回傳的連線資訊貼入 Infinite Studio「主選單 → AI 連線」。瀏覽器可能要求允許本機網路連線；拒絕後需在瀏覽器網站設定中調整。連線資訊是臨時密鑰，請勿公開；服務只接受本機連線與正式站來源。連線時預設允許本次連線自動修改畫布；可取消勾選，改成每次修改都須確認。修改可用復原，切換工作檔或中斷連線會結束授權。AI 應在交付前檢查結果；自動儲存依工作檔設定運作，分享權限不變。AI 可以讀取物件資訊和文字；媒體原始資料不會提供。

## 本機工作檔

將上方 `args` 改為 `["/絕對路徑/mcp/server.mjs", "--file", "/絕對路徑/原檔.studio", "--output", "/絕對路徑/新檔.studio"]`。也可開啟舊版工作檔。省略 `--output` 時為唯讀；指定輸出時，AI 的修改先留在記憶體中，再以 `save_copy` 建立新檔，後續儲存會產生編號副本，不覆寫原始或已存在的檔案。輸入檔被其他程式修改後，需要重新開啟才能另存。

目前支援檢視物件與群組、讀取單一物件、新增文字或基本形狀，以及修改文字、顏色、位置和尺寸等屬性；尚未支援修改連結文字框的內容、媒體原始內容、直接刪除、重新分群或直接上傳 Drive。線上儲存仍由使用者透過 Infinite Studio 操作。
