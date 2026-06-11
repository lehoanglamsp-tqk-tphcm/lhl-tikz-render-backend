# LHL TikZ Render Backend V103A2

Backend độc lập để render TikZ online ra SVG cho LHL Tool Online.

## 1. Chạy local bằng Python

Máy cần cài sẵn:

- Python 3.11+
- TeX Live có `xelatex`
- `dvisvgm`

Cài thư viện Python:

```bash
pip install -r requirements.txt
```

Chạy server:

```bash
uvicorn app:app --host 0.0.0.0 --port 8000
```

Kiểm tra:

```text
http://localhost:8000/health
```

## 2. Chạy bằng Docker

Build image:

```bash
docker build -t lhl-tikz-render:v103a .
```

Run:

```bash
docker run --rm -p 8000:8000 lhl-tikz-render:v103a
```

## 3. Test API

```bash
curl -X POST http://localhost:8000/render-tikz \
  -H "Content-Type: application/json" \
  -d "{\"tikz\":\"\\\\begin{tikzpicture}\\\\draw (0,0) circle (1cm);\\\\end{tikzpicture}\",\"format\":\"svg\",\"engine\":\"xelatex\"}"
```

## 4. API

### POST /render-tikz

Request:

```json
{
  "tikz": "\\begin{tikzpicture}\\draw (0,0) circle (1cm);\\end{tikzpicture}",
  "format": "svg",
  "engine": "xelatex",
  "timeout_seconds": 20
}
```

Response thành công:

```json
{
  "ok": true,
  "format": "svg",
  "svg": "<svg ...></svg>",
  "cached": false,
  "log": ""
}
```

Response lỗi:

```json
{
  "ok": false,
  "error": "Biên dịch LaTeX thất bại.",
  "log": "..."
}
```

## 5. Bảo mật

V103A2 không bật `-shell-escape`.

Backend chặn các lệnh:

- `\write18`
- `\input`
- `\include`
- `\openout`
- `\read`
- `\catcode`
- `\usepackage`
- `\documentclass`

Mục tiêu là chỉ nhận code TikZ/body, không nhận full LaTeX document.

## 6. Ghép với LHL Tool Online

Sau khi backend deploy xong và có URL, frontend V103B sẽ gọi:

```js
window.LHL_TIKZ_RENDER_API = "https://your-backend-domain/render-tikz";
```

Sau đó nút TikZ SVG sẽ gửi code TikZ lên API và chèn SVG vào editor.


## V103A2 update

- Bổ sung `\usetikzlibrary{arrows}` để hỗ trợ code TikZ cũ dùng `>=stealth`.
- Đổi `PREAMBLE_VERSION` để cache SVG cũ không làm ảnh hưởng bản mới.


## V103A3 update

- Bỏ `fontspec` và `\setmainfont{...}` để tránh lỗi font trên Render.
- Giữ engine `xelatex`.
- Bổ sung thêm một số TikZ libraries:
  - `decorations.markings`
  - `decorations.pathmorphing`
  - `through`
  - `backgrounds`
  - `fit`
- Vẫn giữ `tikz`, `tkz-euclide`, `tkz-tab`, `arrows`, `arrows.meta`.
