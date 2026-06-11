# LHL Tool Online Alpha V7 – nền V82

Bản thử nghiệm bước 1 để kiểm tra khả năng chạy LHL Tool trên web/Vercel.

## Mục tiêu bản Alpha

- Chạy giao diện soạn thảo/preview MathJax trên trình duyệt.
- Mở file HTML từ máy người dùng.
- Lưu/tải file HTML về máy người dùng.
- Dán nội dung từ Word vào editor rồi dùng các nút xử lý JS hiện có như Chuyển Word/Chuẩn Hóa.
- In PDF bằng `window.print()`.
- Dùng localStorage để lưu tạm cấu hình G.Sheet/API nếu cần.

## Giới hạn Alpha

Các phần phụ thuộc desktop/Python hoặc cần backend riêng chưa phải mục tiêu của bước 1:

- Render TikZ bằng TeX Live cục bộ.
- Gộp nhiều file Excel/PDF theo thư mục.
- Chuyển PDF/Word trực tiếp bằng Gemini server-side.
- Bản quyền online thật sự bằng server.
- Che giấu hoàn toàn thuật toán JS ở frontend.

## Chạy thử trên máy

```bash
npm install
npm start
```

Sau đó mở địa chỉ mà terminal hiển thị.

## Đưa lên Vercel qua GitHub

1. Tạo repository **Private** trên GitHub.
2. Upload toàn bộ thư mục này lên repo.
3. Vào Vercel → Add New Project → Import repo.
4. Framework Preset: Other.
5. Output/Public directory: `public`.
6. Deploy.

## Ghi chú bảo mật

Đây là bản frontend Alpha. Code JavaScript chạy trong trình duyệt vẫn có thể bị xem/minify/reverse. Muốn bảo mật bản quyền thật sự, bước tiếp theo cần tách phần đăng nhập/bản quyền/API bí mật sang backend.


## Alpha V2
- Bổ sung lưu đè bằng File System Access API trên Chrome/Edge khi mở file bằng nút Mở File.
- Nút Paste đọc HTML/ảnh clipboard tốt hơn, gần giống Ctrl+V.
- Vá lỗi sau In PDF bị mất focus editor.
- Canh lại mép phải một số nút giao diện.
- Vá nhẹ truy ngược trong câu có hình bên phải/immini.

## Alpha V3
- Sửa lưu file online: ưu tiên hộp chọn file/thư mục trực tiếp của Chrome/Edge, hỗ trợ lưu đè khi trình duyệt cấp quyền.
- Cải thiện nút Paste với clipboard HTML/ảnh từ Word.
- Canh lại nút Save As/G.Sheet.


## Alpha V4

- Fix che kín giao diện khi In PDF.
- Co/canh lại nút G.Sheet.
- Thử nghiệm mở trực tiếp file `.docx` trên web bằng Mammoth.
- Cải thiện Paste ảnh Word trong giới hạn Clipboard API của trình duyệt.


## Alpha V5
- Co nút G.Sheet để mép phải gọn hơn.
- Trộn đề online lưu trực tiếp vào thư mục người dùng chọn trên Chrome/Edge.


## Alpha V7
- Fix Trộn đề online: khi lưu vào thư mục bằng showDirectoryPicker, dùng đúng thuộc tính `filename` của từng đề, không ghi đè tất cả vào một file `de.html`.
- Cảnh báo Allow của trình duyệt là bình thường khi website xin quyền ghi file vào thư mục thầy chọn.

## Alpha V12
- Co gọn nút G.Sheet thêm để không tràn mép phải.
- Bản online cho Gộp file truy cập file/thư mục trên máy: gộp bảng đáp án, chọn/nối PDF bằng trình duyệt.
- Chuyển file ưu tiên hộp chọn file hệ thống cho Word/PDF; Word DOCX vẫn chuyển trực tiếp bằng Mammoth, PDF cần backend riêng nếu muốn chuyển bằng Gemini.


## Alpha V12
- Fix gộp đáp án Excel và nút Chuyển file trên bản online.
