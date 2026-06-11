# LHL TikZ Render Backend V103A6

# LHL TikZ Render Backend V103A5

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


## V103A4 update

- Sửa lỗi Render/dvisvgm:
  `ERROR: To process PDF files, either Ghostscript < 10.01.0 or mutool is required`.
- Đổi pipeline mặc định:
  `xelatex -no-pdf -> main.xdv -> dvisvgm main.xdv -> SVG`.
- Cách này tránh phụ thuộc Ghostscript khi chuyển PDF sang SVG.
- Dockerfile có thêm `mupdf-tools` làm phương án dự phòng.


## V103A5 update

- Sửa lỗi SVG bị khung quá lớn / hình co nhỏ ở góc preview.
- Dùng pipeline chuẩn: `xelatex -no-pdf -> main.xdv -> dvisvgm`.
- Lệnh `dvisvgm` mới: `--bbox=min --exact --no-fonts`.
- `--bbox=min` giúp crop sát hình TikZ.
- `--no-fonts` giúp SVG hiển thị ổn định hơn khi chèn vào trình duyệt.
- Tăng `PREAMBLE_VERSION` để tránh cache SVG cũ.


## V103A6 update

Bản này đổi hướng từ SVG sang PNG base64 chất lượng cao để LHL Tool hiển thị chắc chắn trong preview.

Pipeline mới:

```text
TikZ code -> standalone PDF crop sát hình -> pdftocairo PNG 300dpi -> image_base64
```

API vẫn là:

```text
POST /render-tikz
```

Response thành công:

```json
{
  "ok": true,
  "format": "png",
  "mime": "image/png",
  "image_base64": "...",
  "cached": false,
  "log": ""
}
```

Ưu điểm:
- Không phụ thuộc dvisvgm/Ghostscript để render SVG.
- Không bị lỗi trình duyệt không hiển thị data:image/svg+xml.
- Ảnh PNG base64 hiển thị giống ảnh Word/file ảnh trong LHL Tool.

