// LHL Tool Online Alpha shim V12
// Mục tiêu: giúp lõi web V82 chạy trên trình duyệt/Vercel mà không cần pywebview desktop.
(function () {
  'use strict';

  const fileHandleMap = new Map();
  let lastOpenedHandleKey = '';

  function safeName(name) {
    return String(name || 'LHL_Tool_Online.html').replace(/[\\/:*?"<>|]+/g, '_');
  }


  function lhlFileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const s = String(reader.result || '');
        resolve(s.includes(',') ? s.split(',').pop() : s);
      };
      reader.onerror = () => reject(reader.error || new Error('Không đọc được file.'));
      reader.readAsDataURL(file);
    });
  }

  function lhlOnlineBuildGeminiPrompt(kind) {
    return `Bạn là công cụ gõ lại đề Toán THPT từ file ${kind === 'pdf' ? 'PDF' : 'Word'} sang HTML dùng cho LHL Tool.
Yêu cầu bắt buộc:
1) Gõ lại toàn bộ nội dung đề theo đúng thứ tự trong file gốc, không bỏ câu, không tự đổi số câu, không tự đảo câu.
2) Công thức toán viết bằng LaTeX chuẩn và đặt trong dấu $...$; công thức dài cũng dùng $...$.
3) Giữ nguyên cấu trúc PHẦN I, PHẦN II, PHẦN III nếu có. Mỗi phần phải đứng đúng vị trí như file gốc.
4) Phần trắc nghiệm A, B, C, D phải giữ đủ phương án, nhưng KHÔNG được tự suy ra hay tự gạch chân đáp án đúng. Nếu file gốc có gạch chân thật thì chỉ chép lại đúng phần nhìn thấy; nếu không chắc thì để bình thường, không tự đoán.
5) Phần đúng/sai a), b), c), d) phải giữ đủ ý, nhưng KHÔNG được tự suy ra hay tự gạch chân ý đúng/sai.
6) Phần trả lời ngắn phải giữ nguyên dòng Đáp số/Đáp án/ĐS nếu có trong file gốc. Không tự giải và không tự điền đáp số nếu file gốc không có.
7) Nếu gặp hình mà không thể chèn lại ảnh, hãy đặt đúng vị trí một dòng riêng đúng mẫu: <div class="lhl-gemini-image-placeholder">[CHÈN ẢNH VÀO ĐÂY]</div>. Không được để khung ảnh lẫn vào đáp án hoặc lẫn vào choices.
8) Nếu đọc được bảng thì gõ thành <table> có border. Nếu không chắc, ưu tiên giữ nguyên nội dung nhìn thấy và không tự suy diễn.
9) Tuyệt đối không thêm comment metadata đáp án, không thêm lời giải, không thêm giải thích, không thêm nội dung ngoài đề.
10) Chỉ trả về HTML phần thân để đưa vào editor, không dùng markdown, không bọc trong code fence.`;
  }

  async function lhlOnlineGeminiCall(file, key, model, kind) {
    const base64 = await lhlFileToBase64(file);
    const mime = file.type || (kind === 'pdf' ? 'application/pdf' : 'application/octet-stream');
    const body = {
      contents: [{
        role: 'user',
        parts: [
          { text: lhlOnlineBuildGeminiPrompt(kind) },
          { inlineData: { mimeType: mime, data: base64 } }
        ]
      }],
      generationConfig: { temperature: 0.05, topP: 0.8, maxOutputTokens: 65536 }
    };
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model || 'gemini-2.5-flash') + ':generateContent?key=' + encodeURIComponent(key);
    const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(()=>null);
    if(!res.ok) {
      const msg = (json && json.error && json.error.message) || ('Gemini HTTP ' + res.status);
      throw new Error(msg);
    }
    const parts = json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts;
    const txt = Array.isArray(parts) ? parts.map(p => p.text || '').join('\n') : '';
    if(!txt.trim()) throw new Error('Gemini không trả về nội dung.');
    return txt;
  }

  async function lhlOnlineGeminiConvertFile(file, keys, cfg, kind) {
    const models = [cfg.model || 'gemini-2.5-flash', cfg.fallback_model || cfg.fallback || 'gemini-2.5-flash-lite'].filter(Boolean);
    let lastErr = null;
    for (const model of models) {
      for (let i=0;i<keys.length;i++) {
        try {
          if (window.lhlConvertSetStatus) window.lhlConvertSetStatus('⏳ Đang gửi Gemini...\nFile: '+file.name+'\nModel: '+model+'\nAPI: '+(i+1)+'/'+keys.length, '');
          return await lhlOnlineGeminiCall(file, keys[i], model, kind);
        } catch(e) {
          lastErr = e;
          console.warn('Gemini lỗi, thử key/model tiếp:', model, i, e);
        }
      }
    }
    throw lastErr || new Error('Không chuyển được file bằng Gemini.');
  }

  function lhlOnlineCleanGeminiHtml(html) {
    let s = String(html || '').trim();
    s = s.replace(/^```(?:html)?\s*/i, '').replace(/```$/i, '').trim();
    const m = s.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (m) s = m[1].trim();
    s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
    // ONLINE ALPHA V14: đánh dấu nguồn Gemini để nút Chuyển Word không kích nhầm nhánh T9 mẫu cứng.
    if (!/LHL_GEMINI_CONVERTED/i.test(s)) s = '<!-- LHL_GEMINI_CONVERTED -->\n' + s;
    return s;
  }

  function downloadText(text, filename, type) {
    const blob = new Blob([text || ''], { type: type || 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName(filename || 'LHL_Tool_File.html');
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
  }

  async function writeFileHandle(handle, text) {
    const writable = await handle.createWritable();
    await writable.write(text || '');
    await writable.close();
  }

  async function ensureMammothLoaded() {
    if (window.mammoth && window.mammoth.convertToHtml) return true;
    return await new Promise((resolve) => {
      const old = document.getElementById('lhl-mammoth-cdn');
      if (old) {
        old.addEventListener('load', () => resolve(true), { once: true });
        old.addEventListener('error', () => resolve(false), { once: true });
        setTimeout(() => resolve(!!(window.mammoth && window.mammoth.convertToHtml)), 5000);
        return;
      }
      const script = document.createElement('script');
      script.id = 'lhl-mammoth-cdn';
      script.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
      setTimeout(() => resolve(!!(window.mammoth && window.mammoth.convertToHtml)), 8000);
    });
  }

  async function convertDocxFileToHtml(file) {
    const ok = await ensureMammothLoaded();
    if (!ok || !window.mammoth) {
      showOnlineNotice('⚠️ Chưa tải được bộ đọc Word online. Thầy thử lại khi có Internet hoặc dùng Ctrl+V từ Word.');
      return '';
    }
    try {
      const arrayBuffer = await file.arrayBuffer();
      const options = {
        // ONLINE ALPHA V8: giữ underline trực tiếp trong Word để nút Chuyển Word nhận diện đáp án đúng.
        // Mammoth mặc định hay bỏ định dạng gạch chân vì xem là formatting; styleMap này ép về <u>.
        styleMap: [
          'u => u',
          'strike => s'
        ],
        includeDefaultStyleMap: true,
        convertImage: window.mammoth.images.imgElement(function(image) {
          return image.read('base64').then(function(imageBuffer) {
            return { src: 'data:' + image.contentType + ';base64,' + imageBuffer };
          });
        })
      };
      const result = await window.mammoth.convertToHtml({ arrayBuffer }, options);
      let html = String(result && result.value || '');
      // ONLINE ALPHA V8: một số Word/Mammoth xuất underline dạng style, đổi nhãn đáp án về <u>.
      html = html.replace(/<span\b([^>]*)style=["'][^"']*text-decoration\s*:\s*underline[^"']*["']([^>]*)>([\s\S]*?)<\/span>/gi, '<u>$3</u>');
      html = html.replace(/<span\b([^>]*)class=["'][^"']*underline[^"']*["']([^>]*)>([\s\S]*?)<\/span>/gi, '<u>$3</u>');
      html = html.replace(/<img\b([^>]*?)>/gi, function(m, attrs){
        if (/style=/i.test(attrs)) return '<img' + attrs + '>';
        return '<img' + attrs + ' style="max-width:250px;height:auto;">';
      });
      html = '<div class="lhl-word-paste-fragment" style="display:block; clear:both; width:100%;">' + html + '</div>';
      if (result && result.messages && result.messages.length) console.log('Mammoth messages:', result.messages);
      return html;
    } catch(e) {
      console.log('convertDocxFileToHtml lỗi:', e);
      showOnlineNotice('⚠️ Chưa chuyển được file Word trực tiếp. Thầy có thể mở Word rồi Ctrl+A/Ctrl+C dán vào phần mềm.');
      return '';
    }
  }

  async function chooseTextFile(accept) {
    // Chrome/Edge: hỗ trợ lưu đè bằng File System Access API và thử mở trực tiếp .docx.

    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [{
            description: 'HTML/Text files',
            accept: { 'text/html': ['.html', '.htm'], 'text/plain': ['.txt'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] }
          }]
        });
        if (!handle) return null;
        const file = await handle.getFile();
        let content = '';
        if (/\.docx$/i.test(file.name)) content = await convertDocxFileToHtml(file);
        else content = await file.text();
        const key = 'onlinefs:' + Date.now() + ':' + file.name;
        fileHandleMap.set(key, handle);
        lastOpenedHandleKey = key;
        return { filename: file.name, filepath: key, content };
      } catch (e) {
        // User cancel hoặc trình duyệt không cấp quyền: rơi về input cũ.
        if (e && e.name === 'AbortError') return null;
      }
    }

    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept || '.html,.htm,.txt,.docx';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) { input.remove(); resolve(null); return; }
        const reader = new FileReader();
        reader.onload = () => {
          input.remove();
          // Không có file handle thì không thể lưu đè thật; save sẽ tải file mới.
          resolve({ filename: file.name, filepath: '', content: String(reader.result || '') });
        };
        reader.onerror = () => { input.remove(); resolve(null); };
        if (/\.docx$/i.test(file.name)) {
          convertDocxFileToHtml(file).then(content => { input.remove(); resolve({ filename: file.name.replace(/\.docx$/i, '.html'), filepath: '', content: content || '' }); });
        } else {
          reader.readAsText(file, 'UTF-8');
        }
      };
      input.click();
    });
  }

  function showOnlineNotice(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
    else console.log(message);
  }

  async function blobToDataUrl(blob) {
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => resolve('');
      r.readAsDataURL(blob);
    });
  }

  async function readClipboardTextFallback() {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        return await navigator.clipboard.readText();
      }
    } catch (e) {}
    return '';
  }

  async function readClipboardHtmlFallback() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) return { ok: false, html: '' };
      const items = await navigator.clipboard.read();
      let html = '';
      let firstImage = '';
      for (const item of items) {
        if (item.types && item.types.includes('text/html')) {
          const blob = await item.getType('text/html');
          html = await blob.text();
        }
        const imgType = item.types && item.types.find(t => /^image\//i.test(t));
        if (imgType && !firstImage) {
          const blob = await item.getType(imgType);
          firstImage = await blobToDataUrl(blob);
        }
      }
      // Nếu HTML Word không nhúng data:image nhưng clipboard có bitmap, thêm ảnh ở cuối để nút Paste không mất hình.
      if (html && firstImage && !/data:image\//i.test(html) && !/<img\b/i.test(html)) {
        html += '<p><img src="' + firstImage + '" /></p>';
      }
      if (html) return { ok: true, html };
      return { ok: false, html: '' };
    } catch (e) {
      console.log('Không đọc được HTML clipboard online:', e);
      return { ok: false, html: '' };
    }
  }

  async function readClipboardImageFallback() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) return { ok: false };
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(t => /^image\//i.test(t));
        if (!type) continue;
        const blob = await item.getType(type);
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl) return { ok: true, data_url: dataUrl, data: dataUrl, src: dataUrl };
      }
    } catch (e) {
      console.log('Không đọc được image clipboard online:', e);
    }
    return { ok: false };
  }

  function restoreEditorFocusSoon() {
    const restore = () => {
      try {
        const ed = document.getElementById('editor');
        if (ed && !ed.disabled) {
          ed.focus();
          if (typeof window.savedStart === 'number' && typeof ed.setSelectionRange === 'function') {
            ed.setSelectionRange(window.savedStart, window.savedEnd || window.savedStart);
          }
        }
        document.body.classList.remove('lhl-printing-online');
        const toast = document.getElementById('toast-notification');
        if (toast) toast.className = String(toast.className || '').replace('show', '');
      } catch(e) {}
    };
    setTimeout(restore, 150);
    setTimeout(restore, 800);
    setTimeout(restore, 1800);
  }


  function showFolderAccessNotice(kind){
    const isPdf = String(kind || '').toLowerCase().includes('pdf');
    return new Promise((resolve)=>{
      try{
        const old=document.getElementById('lhlOnlineFolderAccessNotice');
        if(old) old.remove();
        const overlay=document.createElement('div');
        overlay.id='lhlOnlineFolderAccessNotice';
        overlay.innerHTML=`
          <div class="lhl-folder-notice-box">
            <div class="lhl-folder-notice-title">${isPdf ? '📄 Cho phép đọc thư mục PDF' : '📁 Chọn thư mục lưu bộ đề'}</div>
            <div class="lhl-folder-notice-text">
              ${isPdf
                ? 'Bản online cần xin quyền đọc các file PDF trong thư mục thầy/cô chọn để nối file.<br>Sau khi bấm <b>Tiếp tục</b>, trình duyệt sẽ hiện hộp xác nhận bảo mật. Thầy/Cô bấm <b>Allow</b> để cho phép đọc thư mục.'
                : 'Bản online cần xin quyền ghi file vào đúng thư mục thầy/cô chọn để lưu đủ các mã đề và bảng đáp án.<br>Sau khi bấm <b>Tiếp tục</b>, trình duyệt sẽ hiện thêm hộp xác nhận bảo mật. Thầy/Cô bấm <b>Allow</b> để cho phép lưu file.'}
            </div>
            <div class="lhl-folder-notice-actions">
              <button type="button" class="lhl-folder-notice-btn lhl-folder-notice-cancel">Hủy</button>
              <button type="button" class="lhl-folder-notice-btn lhl-folder-notice-ok">${isPdf ? 'Tiếp tục chọn thư mục PDF' : 'Tiếp tục chọn thư mục'}</button>
            </div>
          </div>`;
        document.body.appendChild(overlay);
        const close=(val)=>{try{overlay.remove();}catch(e){} resolve(val);};
        overlay.querySelector('.lhl-folder-notice-cancel').onclick=()=>close(false);
        overlay.querySelector('.lhl-folder-notice-ok').onclick=()=>close(true);
        overlay.addEventListener('mousedown',(e)=>{ if(e.target===overlay) e.preventDefault(); });
      }catch(e){ resolve(true); }
    });
  }





  // ONLINE ALPHA V11: helper chọn nhiều file, gộp PDF bằng pdf-lib và escape HTML.
  function escapeHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function pickMultipleFiles(accept) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = accept || '*/*';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.onchange = () => { const files = Array.from(input.files || []); input.remove(); resolve(files); };
      input.click();
    });
  }
  async function pickPdfFiles() {
    if (window.showOpenFilePicker) {
      const handles = await window.showOpenFilePicker({ multiple:true, types:[{ description:'PDF', accept:{ 'application/pdf':['.pdf'] } }] });
      const files = [];
      for (const h of handles || []) files.push(await h.getFile());
      return files;
    }
    return await pickMultipleFiles('.pdf');
  }
  async function ensurePdfLibLoaded() {
    if (window.PDFLib && window.PDFLib.PDFDocument) return true;
    return await new Promise((resolve) => {
      const old = document.getElementById('lhl-pdflib-cdn');
      if (old) { setTimeout(() => resolve(!!(window.PDFLib && window.PDFLib.PDFDocument)), 3000); return; }
      const script = document.createElement('script');
      script.id = 'lhl-pdflib-cdn';
      script.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
      setTimeout(() => resolve(!!(window.PDFLib && window.PDFLib.PDFDocument)), 8000);
    });
  }
  async function mergePdfFilesOnline(files) {
    const ok = await ensurePdfLibLoaded();
    if (!ok || !window.PDFLib) return { ok:false, success:false, error:'Chưa tải được thư viện nối PDF online. Thầy kiểm tra Internet rồi thử lại.' };
    const { PDFDocument } = window.PDFLib;
    const out = await PDFDocument.create();
    let count = 0;
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const src = await PDFDocument.load(bytes);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(p => out.addPage(p));
      count++;
    }
    const merged = await out.save();
    const name = 'Gop_PDF_LHL_Tool.pdf';
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName:name, types:[{ description:'PDF', accept:{ 'application/pdf':['.pdf'] } }] });
        const w = await h.createWritable(); await w.write(new Blob([merged], { type:'application/pdf' })); await w.close();
        return { ok:true, success:true, count, filename:name };
      } catch(e) { if (e && e.name === 'AbortError') return { ok:false, cancelled:true }; }
    }
    const url = URL.createObjectURL(new Blob([merged], { type:'application/pdf' }));
    const a = document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1000);
    return { ok:true, success:true, count, filename:name };
  }


  // ONLINE ALPHA V12: đọc bảng đáp án .xls HTML và gộp lại theo mã đề tăng dần.
  function decodeHtmlText(s) {
    try { const t=document.createElement('textarea'); t.innerHTML=String(s||''); return t.value; } catch(e) { return String(s||''); }
  }
  function cleanCellText(s) {
    return decodeHtmlText(String(s||''))
      .replace(/<[^>]+>/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }
  function extractNumericCode(s) {
    const m = String(s||'').match(/\d{3,6}/);
    return m ? m[0] : String(s||'').trim();
  }
  function parseAnswerTableHtml(text, fileName) {
    const raw = String(text || '');
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    const tables = Array.from(doc.querySelectorAll('table'));
    const table = tables.find(tb => /mã\s*đề|ma\s*de|câu/i.test(tb.textContent || '')) || tables[0];
    if (!table) return null;
    const trs = Array.from(table.querySelectorAll('tr'));
    if (!trs.length) return null;
    let headerIndex = trs.findIndex(tr => /mã\s*đề|ma\s*de/i.test(tr.textContent || ''));
    if (headerIndex < 0) headerIndex = 0;
    const headerCells = Array.from(trs[headerIndex].children).map(td => cleanCellText(td.innerHTML || td.textContent));
    if (headerCells.length < 2) return null;
    const codes = headerCells.slice(1).map(extractNumericCode).filter(Boolean);
    if (!codes.length) return null;
    const byCode = {};
    codes.forEach(c => byCode[c] = { p1: [], p2: [], p3: [] });
    let currentPart = 'p1';
    for (let r = headerIndex + 1; r < trs.length; r++) {
      const tr = trs[r];
      const cells = Array.from(tr.children).map(td => cleanCellText(td.innerHTML || td.textContent));
      if (cells.length < 2) continue;
      const cls = String(tr.className || '').toLowerCase();
      if (/p2/.test(cls)) currentPart = 'p2';
      else if (/p3/.test(cls)) currentPart = 'p3';
      else if (/p1/.test(cls)) currentPart = 'p1';
      const first = cells[0];
      // Nhận các dòng đáp án theo số thứ tự câu. Bỏ qua dòng trống/phụ.
      if (!first || !/\d+/.test(first)) continue;
      codes.forEach((code, i) => {
        const ans = cells[i + 1] || '';
        byCode[code][currentPart].push(ans);
      });
    }
    return { codes, byCode, fileName: fileName || '' };
  }
  function buildMergedAnswerXlsFromMaps(codeMaps) {
    const allCodes = Object.keys(codeMaps).sort((a,b)=>String(a).localeCompare(String(b),'vi',{numeric:true}));
    const maxLen = part => Math.max(0, ...allCodes.map(c => (codeMaps[c][part] || []).length));
    const esc = escapeHtml;
    const maxP1 = maxLen('p1'), maxP2 = maxLen('p2'), maxP3 = maxLen('p3');
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      body{font-family:Arial,Tahoma,sans-serif;font-size:12pt;}
      table{border-collapse:collapse;} td,th{border:1px solid #000;padding:4px 8px;text-align:center;mso-number-format:"\\@";}
      th{background:#d9ead3;font-weight:bold;} .p1 td{background:#ffe599;} .p2 td{background:#d9ead3;} .p3 td{background:#92d050;}
      .left{font-weight:bold;background:#d9ead3!important;min-width:60px;} .code{font-style:italic;font-weight:bold;}
    </style></head><body><table>`;
    html += '<tr><th>Câu\\Mã Đề</th>' + allCodes.map(c => '<th class="code">' + esc(c) + '</th>').join('') + '</tr>';
    for (let i=0;i<maxP1;i++) html += '<tr class="p1"><td class="left">'+(i+1)+'</td>' + allCodes.map(c=>'<td>'+esc((codeMaps[c].p1||[])[i]||'')+'</td>').join('') + '</tr>';
    for (let i=0;i<maxP2;i++) html += '<tr class="p2"><td class="left">'+(i+1)+'</td>' + allCodes.map(c=>'<td>'+esc((codeMaps[c].p2||[])[i]||'')+'</td>').join('') + '</tr>';
    for (let i=0;i<maxP3;i++) html += '<tr class="p3"><td class="left">'+(i+1)+'</td>' + allCodes.map(c=>'<td>'+esc((codeMaps[c].p3||[])[i]||'')+'</td>').join('') + '</tr>';
    html += '</table></body></html>';
    return { html, count: allCodes.length };
  }



  // ============================================================
  // ONLINE ALPHA V48 - PDF + WORD IMAGE MERGE HELPERS
  // Cơ chế: chọn cùng lúc 1 PDF + 1 DOCX.
  // PDF gửi Gemini gõ lại HTML; DOCX chỉ dùng để bóc ảnh gốc trong word/media.
  // Sau đó ghép ảnh Word vào các placeholder ảnh Gemini theo thứ tự.
  // ============================================================
  async function ensureJSZipLoadedV48() {
    if (window.JSZip) return true;
    return await new Promise((resolve) => {
      const old = document.getElementById('lhl-jszip-cdn-v48');
      if (old) {
        old.addEventListener('load', () => resolve(true), { once:true });
        old.addEventListener('error', () => resolve(false), { once:true });
        setTimeout(() => resolve(!!window.JSZip), 7000);
        return;
      }
      const script = document.createElement('script');
      script.id = 'lhl-jszip-cdn-v48';
      script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
      setTimeout(() => resolve(!!window.JSZip), 10000);
    });
  }

  function lhlV48XmlAttr(tag, name) {
    const escName = String(name || '').replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const re = new RegExp(escName + "\\s*=\\s*(['\\\"])(.*?)\\1", "i");
    const m = re.exec(String(tag || ''));
    return m ? m[2] : '';
  }

  function lhlV48MimeFromPath(path) {
    const p = String(path || '').toLowerCase();
    if (/\.jpe?g$/.test(p)) return 'image/jpeg';
    if (/\.png$/.test(p)) return 'image/png';
    if (/\.gif$/.test(p)) return 'image/gif';
    if (/\.bmp$/.test(p)) return 'image/bmp';
    if (/\.webp$/.test(p)) return 'image/webp';
    if (/\.svg$/.test(p)) return 'image/svg+xml';
    return 'image/png';
  }

  function lhlV48NormalizeTarget(target) {
    let t = String(target || '').replace(/^\/+/, '');
    if (!t) return '';
    if (/^word\//i.test(t)) return t;
    t = t.replace(/^\.\.\//, '');
    return 'word/' + t;
  }

  async function lhlV48ExtractDocxImagesOrdered(file) {
    const ok = await ensureJSZipLoadedV48();
    if (!ok || !window.JSZip) throw new Error('Không tải được JSZip để đọc ảnh trong DOCX.');
    const arrayBuffer = await file.arrayBuffer();
    const zip = await window.JSZip.loadAsync(arrayBuffer);

    const relMap = {};
    const relFile = zip.file('word/_rels/document.xml.rels');
    if (relFile) {
      const relXml = await relFile.async('string');
      relXml.replace(/<Relationship\b[^>]*>/gi, function(tag){
        const id = lhlV48XmlAttr(tag, 'Id');
        const target = lhlV48NormalizeTarget(lhlV48XmlAttr(tag, 'Target'));
        const type = lhlV48XmlAttr(tag, 'Type');
        if (id && target && /image/i.test(type)) relMap[id] = target;
        return tag;
      });
    }

    let order = [];
    const docFile = zip.file('word/document.xml');
    if (docFile) {
      const docXml = await docFile.async('string');
      docXml.replace(/<a:blip\b[^>]*(?:r:embed|r:link)=["']([^"']+)["'][^>]*>/gi, function(m, rid){
        if (rid && relMap[rid]) order.push(relMap[rid]);
        return m;
      });
      docXml.replace(/<v:imagedata\b[^>]*r:id=["']([^"']+)["'][^>]*>/gi, function(m, rid){
        if (rid && relMap[rid]) order.push(relMap[rid]);
        return m;
      });
    }

    // Nếu không đọc được thứ tự trong document.xml thì fallback theo tên file media.
    if (!order.length) {
      order = Object.keys(zip.files).filter(p => /^word\/media\//i.test(p) && !zip.files[p].dir)
        .sort((a,b)=>String(a).localeCompare(String(b), 'en', { numeric:true }));
    }

    order = order.filter((p, i, arr) => p && arr.indexOf(p) === i);
    const images = [];
    for (let i=0;i<order.length;i++) {
      const f = zip.file(order[i]);
      if (!f) continue;
      const mime = lhlV48MimeFromPath(order[i]);
      const b64 = await f.async('base64');
      images.push({
        index: i + 1,
        index3: String(i + 1).padStart(3, '0'),
        path: order[i],
        mime,
        dataUrl: 'data:' + mime + ';base64,' + b64
      });
    }
    return images;
  }

  function lhlV48ImageHtml(img) {
    const idx = img && img.index3 ? img.index3 : '';
    if (!img || !img.dataUrl) {
      return '<div class="lhl-gemini-image-placeholder" data-img-index="'+idx+'">[CHÈN ẢNH '+idx+' VÀO ĐÂY]</div>';
    }
    return '<div class="lhl-word-image" data-img-index="'+idx+'"><img src="'+img.dataUrl+'" style="width:40%;height:auto;"></div>';  }

  function lhlV48MergeWordImagesIntoGeminiHtml(html, images) {
    let s = String(html || '');
    const imgs = Array.isArray(images) ? images : [];
    if (!imgs.length) return s;

    let seq = 0;
    const used = {};
    function byNum(num) {
      const n = parseInt(String(num || '').replace(/\D/g,''), 10);
      if (!n || n < 1) return null;
      return imgs[n-1] || null;
    }
    function nextImg() {
      while (seq < imgs.length && used[seq+1]) seq++;
      const img = imgs[seq] || null;
      if (img) { used[img.index] = true; seq++; }
      return img;
    }

    // 1) Placeholder div có hoặc không có số.
    s = s.replace(/<div\b([^>]*class=["'][^"']*lhl-gemini-image-placeholder[^"']*["'][^>]*)>[\s\S]*?\[\s*(?:CHÈN|Chèn)\s*ẢNH\s*(\d{1,3})?\s*VÀO\s*ĐÂY\s*\][\s\S]*?<\/div>/gi,
      function(full, attrs, num){
        let img = null;
        const dm = /data-img-index\s*=\s*["']?(\d{1,3})["']?/i.exec(attrs || '');
        if (dm) img = byNum(dm[1]);
        if (!img && num) img = byNum(num);
        if (!img) img = nextImg();
        if (img) { used[img.index] = true; return lhlV48ImageHtml(img); }
        return full;
      });

    // 2) Placeholder text có số.
    s = s.replace(/\[\s*(?:CHÈN|Chèn)\s*ẢNH\s*(\d{1,3})\s*VÀO\s*ĐÂY\s*\]/gi, function(full, num){
      const img = byNum(num);
      if (img) { used[img.index] = true; return lhlV48ImageHtml(img); }
      return full;
    });

    // 3) Placeholder text không số: ghép tuần tự.
    s = s.replace(/\[\s*(?:CHÈN|Chèn)\s*ẢNH\s*VÀO\s*ĐÂY\s*\]/gi, function(full){
      const img = nextImg();
      return img ? lhlV48ImageHtml(img) : full;
    });

    // V50: không tự đưa ảnh dư xuống cuối nữa.
    // Lý do: trong Word có thể có ảnh công thức/OLE hoặc hình phụ làm lệch, đưa xuống cuối gây dư rất nhiều ảnh.
    const unused = imgs.filter(img => !used[img.index]);
    if (unused.length) {
      s += '\n\n<!-- LHL_V50_UNUSED_WORD_IMAGES_NOT_INSERTED: ' + unused.map(x => x.index3).join(',') + ' -->\n';
    }
    return s;
  }


  function lhlV49MeasureImageDataUrl(img) {
    return new Promise((resolve) => {
      try {
        const im = new Image();
        im.onload = () => resolve({
          width: im.naturalWidth || im.width || 0,
          height: im.naturalHeight || im.height || 0
        });
        im.onerror = () => resolve({ width:0, height:0 });
        im.src = img && img.dataUrl ? img.dataUrl : '';
      } catch(e) { resolve({ width:0, height:0 }); }
    });
  }

  async function lhlV49FilterTableLikeWordImages(images) {
    const arr = Array.isArray(images) ? images : [];
    const kept = [], skipped = [];
    for (const img of arr) {
      const size = await lhlV49MeasureImageDataUrl(img);
      img.width = size.width; img.height = size.height;
      const ratio = size.height ? size.width / size.height : 0;

      // V50: chỉ giữ ảnh minh họa thật; bỏ ảnh bảng và ảnh công thức/OLE equation.
      // - Ảnh công thức thường rất nhỏ, rất dẹt hoặc dạng icon rời.
      // - Ảnh bảng thường rất rộng, tỉ lệ ngang lớn.
      const tooSmall = (size.width < 140 || size.height < 70);
      const equationLike = (size.width <= 420 && size.height <= 150 && ratio >= 2.2) || (size.height <= 55) || (size.width <= 90);
      const tableLike = (size.width >= 450 && ratio >= 2.35) || (size.width >= 700 && size.height <= 340);

      img.skip_reason = tableLike ? 'table_like' : (equationLike ? 'equation_like' : (tooSmall ? 'too_small' : ''));
      if (tableLike || equationLike || tooSmall) skipped.push(img);
      else kept.push(img);
    }
    // Đánh số lại ảnh giữ lại để ghép đúng thứ tự placeholder trong đề.
    kept.forEach((img, i) => { img.index = i + 1; img.index3 = String(i + 1).padStart(3, '0'); });
    return { kept, skipped };
  }


  async function lhlV48PickPdfAndDocxFiles() {
    let files = [];
    if (window.showOpenFilePicker) {
      const handles = await window.showOpenFilePicker({
        multiple:true,
        types:[{
          description:'PDF + Word DOCX',
          accept:{
            'application/pdf':['.pdf'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['.docx']
          }
        }]
      });
      for (const h of handles || []) files.push(await h.getFile());
    } else {
      files = await pickMultipleFiles('.pdf,.docx');
    }
    const pdf = (files || []).find(f => /\.pdf$/i.test(f.name) || /pdf/i.test(f.type));
    const docx = (files || []).find(f => /\.docx$/i.test(f.name));
    return { files, pdf, docx };
  }


  // ============================================================
  // ONLINE ALPHA V55 - File System Access API cho Ngân hàng
  // Cho phép nút Chọn NH truy cập trực tiếp thư mục máy người dùng trong trình duyệt Chromium.
  // Áp dụng cho NH ĐỀ THI và NH THEO BÀI/KHỐI 10-11-12.
  // ============================================================
  const lhlFsDirHandleMapV55 = window.__lhlFsDirHandleMapV55 || new Map();
  window.__lhlFsDirHandleMapV55 = lhlFsDirHandleMapV55;

  function lhlFsKeyV55(prefix, handle) {
    return prefix + ':' + Date.now() + ':' + (handle && handle.name ? handle.name : 'folder');
  }

  async function lhlFsPickDirectoryV55(prefix) {
    if (!window.showDirectoryPicker) {
      return { ok:false, error:'Trình duyệt chưa hỗ trợ chọn thư mục trực tiếp. Thầy dùng Chrome/Edge bản mới nhé.' };
    }
    try {
      const handle = await window.showDirectoryPicker({ mode:'readwrite' });
      const key = lhlFsKeyV55(prefix || 'qbankfs', handle);
      lhlFsDirHandleMapV55.set(key, handle);
      return { ok:true, folder:key, name:handle.name || key };
    } catch(e) {
      if (e && e.name === 'AbortError') return { ok:false, cancelled:true };
      return { ok:false, error:e && e.message ? e.message : String(e) };
    }
  }

  function lhlFsGetDirV55(folder) {
    const key = String(folder || '');
    return lhlFsDirHandleMapV55.get(key) || null;
  }

  async function lhlFsGetFileHandleV55(dir, filename, create) {
    return await dir.getFileHandle(filename, { create: !!create });
  }

  async function lhlFsReadFileTextV55(dir, filename) {
    const fh = await lhlFsGetFileHandleV55(dir, filename, false);
    const file = await fh.getFile();
    return await file.text();
  }

  async function lhlFsWriteFileTextV55(dir, filename, content) {
    const fh = await lhlFsGetFileHandleV55(dir, filename, true);
    const w = await fh.createWritable();
    await w.write(String(content || ''));
    await w.close();
  }

  async function lhlFsDeleteFileV55(dir, filename) {
    await dir.removeEntry(filename);
  }

  function lhlCountQuestionsV55(content) {
    const s = String(content || '');
    const m = s.match(/(?:<b>\s*)?Câu\s+\d+\s*[\.:]?/gi);
    if (m && m.length) return m.length;
    const t = s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    return t ? 1 : 0;
  }

  function lhlPreviewTextV55(content) {
    let s = String(content || '');
    s = s.replace(/<script[\s\S]*?<\/script>/gi,' ');
    s = s.replace(/<style[\s\S]*?<\/style>/gi,' ');
    s = s.replace(/\$[^$]*\$/g, function(m){ return m.replace(/\s+/g,' '); });
    s = s.replace(/<[^>]+>/g,' ');
    s = s.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
    s = s.replace(/\s+/g,' ').trim();
    return s.slice(0, 160);
  }

  async function lhlFsListHtmlFilesV55(dir) {
    const files = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file' && /\.html?$/i.test(name)) {
        let content = '';
        try { content = await (await handle.getFile()).text(); } catch(e) { content = ''; }
        files.push({ filename:name, content, count:lhlCountQuestionsV55(content), preview:lhlPreviewTextV55(content) });
      }
    }
    files.sort((a,b)=>String(a.filename).localeCompare(String(b.filename), 'vi', { numeric:true }));
    return files;
  }

  function lhlExamBankFileNameV55(part, n) {
    if (part === 'TN') return 'TN-' + n + '.html';
    if (part === 'DS') return 'DS-' + n + '.html';
    return 'TLN-' + n + '.html';
  }

  function lhlSafeFileStemV55(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^\w\-]+/g,'_')
      .replace(/_+/g,'_')
      .replace(/^_+|_+$/g,'')
      .slice(0,80) || 'Bai';
  }

  function lhlLessonParseFileV55(name) {
    const base = String(name || '').replace(/\.html?$/i,'');
    const parts = base.split('__');
    if (parts.length >= 3) {
      const part = parts[parts.length-1].toUpperCase();
      if (['TN','DS','TLN'].includes(part)) {
        return {
          chapter: parts[0] || 'Chưa phân chương',
          lesson: parts.slice(1,-1).join(' ') || 'Bài',
          part,
          id: parts.slice(0,-1).join('__'),
          filename: name
        };
      }
    }
    const m = base.match(/^(.+?)[\-_](TN|DS|TLN)$/i);
    if (m) return { chapter:'Chưa phân chương', lesson:m[1], part:m[2].toUpperCase(), id:m[1], filename:name };
    return null;
  }

  const api = {
    // ===== V55: Ngân hàng đề thi - thư mục trực tiếp trên máy =====
    async qbank_choose_exam_folder() {
      return await lhlFsPickDirectoryV55('qbank-exam');
    },
    async qbank_init_exam_folder(tn, ds, tln) {
      const picked = await lhlFsPickDirectoryV55('qbank-exam');
      if (!picked || !picked.ok) return picked;
      const dir = lhlFsGetDirV55(picked.folder);
      const counts = { TN:parseInt(tn,10)||0, DS:parseInt(ds,10)||0, TLN:parseInt(tln,10)||0 };
      const made = [];
      for (const part of ['TN','DS','TLN']) {
        for (let i=1;i<=counts[part];i++) {
          const fn = lhlExamBankFileNameV55(part, i);
          try {
            const existing = await lhlFsReadFileTextV55(dir, fn).catch(()=>null);
            if (existing === null) await lhlFsWriteFileTextV55(dir, fn, '');
            made.push(fn);
          } catch(e) {}
        }
      }
      return { ok:true, folder:picked.folder, files:made };
    },
    async qbank_list_exam_folder(folder) {
      const dir = lhlFsGetDirV55(folder);
      if (!dir) return { ok:false, error:'Chưa có quyền truy cập thư mục này trong phiên hiện tại. Thầy bấm Chọn NH lại.' };
      const all = await lhlFsListHtmlFilesV55(dir);
      const files = all.filter(f => /^(TN|DS|TLN)-\d+\.html?$/i.test(f.filename));
      return { ok:true, files };
    },
    async qbank_read_file(folder, filename) {
      const dir = lhlFsGetDirV55(folder);
      if (!dir) return { ok:false, error:'Chưa có quyền thư mục. Bấm Chọn NH lại.' };
      try {
        const content = await lhlFsReadFileTextV55(dir, filename);
        return { ok:true, content, body:content, count:lhlCountQuestionsV55(content) };
      } catch(e) { return { ok:false, error:e && e.message ? e.message : String(e) }; }
    },
    async qbank_write_file_content(folder, filename, content) {
      const dir = lhlFsGetDirV55(folder);
      if (!dir) return { ok:false, error:'Chưa có quyền thư mục. Bấm Chọn NH lại.' };
      try {
        await lhlFsWriteFileTextV55(dir, filename, content || '');
        return { ok:true, count:lhlCountQuestionsV55(content) };
      } catch(e) { return { ok:false, error:e && e.message ? e.message : String(e) }; }
    },
    async qbank_append_questions_to_file(folder, filename, code) {
      const dir = lhlFsGetDirV55(folder);
      if (!dir) return { ok:false, error:'Chưa có quyền thư mục. Bấm Chọn NH lại.' };
      try {
        let old = '';
        try { old = await lhlFsReadFileTextV55(dir, filename); } catch(e) { old = ''; }
        const add = String(code || '').trim();
        const next = (String(old || '').trim() ? String(old || '').trim() + '\n\n' : '') + add + '\n';
        await lhlFsWriteFileTextV55(dir, filename, next);
        return { ok:true, count:lhlCountQuestionsV55(next) };
      } catch(e) { return { ok:false, error:e && e.message ? e.message : String(e) }; }
    },
    async qbank_bulk_append_questions(folder, items) {
      const dir = lhlFsGetDirV55(folder);
      if (!dir) return { ok:false, error:'Chưa có quyền thư mục. Bấm Chọn NH lại.' };
      let okCount = 0, errCount = 0;
      for (const it of (items || [])) {
        const fn = it.filename || it.file || '';
        if (!fn) { errCount++; continue; }
        const r = await this.qbank_append_questions_to_file(folder, fn, it.code || it.content || '');
        if (r && r.ok) okCount++; else errCount++;
      }
      return { ok:true, ok_count:okCount, err_count:errCount };
    },
    async qbank_bulk_append_questions_existing_only(folder, items) {
      return await this.qbank_bulk_append_questions(folder, items);
    },
    async qbank_delete_file(folder, filename) {
      const dir = lhlFsGetDirV55(folder);
      if (!dir) return { ok:false, error:'Chưa có quyền thư mục. Bấm Chọn NH lại.' };
      try { await lhlFsDeleteFileV55(dir, filename); return { ok:true }; }
      catch(e) { return { ok:false, error:e && e.message ? e.message : String(e) }; }
    },
    async qbank_reset_file_questions(folder, filename) {
      return await this.qbank_write_file_content(folder, filename, '');
    },
    async qbank_clear_all_questions(folder) {
      const dir = lhlFsGetDirV55(folder);
      if (!dir) return { ok:false, error:'Chưa có quyền thư mục. Bấm Chọn NH lại.' };
      const files = await lhlFsListHtmlFilesV55(dir);
      let count = 0;
      for (const f of files) {
        if (/^(TN|DS|TLN)-\d+\.html?$/i.test(f.filename)) {
          await lhlFsWriteFileTextV55(dir, f.filename, '');
          count++;
        }
      }
      return { ok:true, count };
    },
    async qbank_stats(folder) {
      const r = await this.qbank_list_exam_folder(folder);
      if (!r.ok) return r;
      const stats = { TN:0, DS:0, TLN:0, total:0 };
      (r.files || []).forEach(f => {
        const n = f.count || 0;
        if (/^TN-/i.test(f.filename)) stats.TN += n;
        else if (/^DS-/i.test(f.filename)) stats.DS += n;
        else if (/^TLN-/i.test(f.filename)) stats.TLN += n;
        stats.total += n;
      });
      return { ok:true, stats };
    },
    async qbank_renumber_exam_files(folder) {
      return { ok:true };
    },
    async qbank_delete_all_files(folder) {
      const dir = lhlFsGetDirV55(folder);
      if (!dir) return { ok:false, error:'Chưa có quyền thư mục. Bấm Chọn NH lại.' };
      const files = await lhlFsListHtmlFilesV55(dir);
      let count = 0;
      for (const f of files) {
        if (/^(TN|DS|TLN)-\d+\.html?$/i.test(f.filename)) {
          try { await lhlFsDeleteFileV55(dir, f.filename); count++; } catch(e) {}
        }
      }
      return { ok:true, count };
    },

    // ===== V55: Ngân hàng theo bài / KHỐI 10-11-12 =====
    async lesson108_choose_folder() {
      return await lhlFsPickDirectoryV55('qbank-lesson');
    },
    async lesson108_create_lesson(folder, chapter, lesson) {
      const dir = lhlFsGetDirV55(folder);
      if (!dir) return { ok:false, error:'Chưa có quyền thư mục. Bấm Chọn NH/Chọn thư mục lưu lại.' };
      const ch = lhlSafeFileStemV55(chapter || 'Chuong');
      const le = lhlSafeFileStemV55(lesson || 'Bai');
      const base = ch + '__' + le + '__';
      try {
        for (const part of ['TN','DS','TLN']) {
          await lhlFsWriteFileTextV55(dir, base + part + '.html', '');
        }
        return { ok:true };
      } catch(e) { return { ok:false, error:e && e.message ? e.message : String(e) }; }
    },
    async lesson108_list(folder) {
      const dir = lhlFsGetDirV55(folder);
      if (!dir) return { ok:false, error:'Chưa có quyền thư mục. Bấm Chọn NH lại.' };
      const all = await lhlFsListHtmlFilesV55(dir);
      const map = {};
      for (const f of all) {
        const meta = lhlLessonParseFileV55(f.filename);
        if (!meta) continue;
        const id = meta.id;
        if (!map[id]) map[id] = { id, chapter:meta.chapter, lesson:meta.lesson, parts:{} };
        map[id].parts[meta.part] = { filename:f.filename, count:f.count||0, preview:f.preview||'' };
      }
      const lessons = Object.values(map).sort((a,b)=>(a.chapter + a.lesson).localeCompare(b.chapter + b.lesson, 'vi', { numeric:true }));
      return { ok:true, lessons };
    },
    async lesson108_read_part(folder, filename) {
      const r = await this.qbank_read_file(folder, filename);
      if (!r.ok) return r;
      return { ok:true, body:r.content || '', content:r.content || '', count:r.count || 0 };
    },
    async lesson108_write_part(folder, filename, text) {
      const r = await this.qbank_write_file_content(folder, filename, text || '');
      return r;
    },
    async lesson108_append_part(folder, filename, code) {
      return await this.qbank_append_questions_to_file(folder, filename, code);
    },
    async lesson108_delete_part(folder, filename) {
      return await this.qbank_delete_file(folder, filename);
    },


    async open_html_file() {
      const res = await chooseTextFile('.html,.htm,.txt,.docx');
      return res || { content: '', filename: '', filepath: '' };
    },

    async save_html_only(htmlContent, defaultName) {
      // Save As bản web V3: ưu tiên mở hộp chọn thư mục/tên file trực tiếp trên Chrome/Edge.
      const filename = safeName(defaultName || 'LHL_Tool_Online.html');
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: 'HTML file', accept: { 'text/html': ['.html', '.htm'] } }]
          });
          if (handle) {
            await writeFileHandle(handle, htmlContent || '');
            const key = 'onlinefs:' + Date.now() + ':' + (handle.name || filename);
            fileHandleMap.set(key, handle);
            lastOpenedHandleKey = key;
            return { filepath: key, filename: handle.name || filename };
          }
        } catch(e) {
          if (!(e && e.name === 'AbortError')) console.log('Save As picker lỗi:', e);
          if (e && e.name === 'AbortError') return { filepath: '', filename: '' };
        }
      }
      downloadText(htmlContent || '', filename, 'text/html;charset=utf-8');
      return { filepath: filename, filename };
    },

    async save_html_direct(filepath, htmlContent) {
      // Lưu đè nếu file được mở/lưu bằng File System Access API trên Chrome/Edge.
      try {
        const key = filepath && fileHandleMap.has(filepath) ? filepath : lastOpenedHandleKey;
        const handle = key ? fileHandleMap.get(key) : null;
        if (handle && handle.createWritable) {
          await writeFileHandle(handle, htmlContent || '');
          return true;
        }
      } catch (e) {
        console.log('Không lưu đè được bằng handle cũ:', e);
      }

      // Nếu chưa có quyền lưu đè, mở hộp chọn vị trí lưu trực tiếp thay vì tải về mặc định.
      if (window.showSaveFilePicker) {
        try {
          const suggested = safeName((filepath && !String(filepath).startsWith('onlinefs:')) ? filepath : 'LHL_Tool_Online.html');
          const handle = await window.showSaveFilePicker({
            suggestedName: suggested,
            types: [{ description: 'HTML file', accept: { 'text/html': ['.html', '.htm'] } }]
          });
          if (handle) {
            await writeFileHandle(handle, htmlContent || '');
            const key = 'onlinefs:' + Date.now() + ':' + (handle.name || suggested);
            fileHandleMap.set(key, handle);
            lastOpenedHandleKey = key;
            return true;
          }
        } catch(e) {
          if (e && e.name === 'AbortError') return false;
          console.log('Không mở được hộp lưu trực tiếp:', e);
        }
      }

      downloadText(htmlContent || '', filepath || 'LHL_Tool_Online.html', 'text/html;charset=utf-8');
      showOnlineNotice('⚠️ Trình duyệt chưa cấp quyền lưu trực tiếp. Em tạm tải file mới về máy.');
      return true;
    },

    async get_clipboard_text() {
      return await readClipboardTextFallback();
    },

    async get_clipboard_html_data() {
      return await readClipboardHtmlFallback();
    },

    async get_clipboard_image_data() {
      return await readClipboardImageFallback();
    },

    async print_direct(html) {
      let cover = null;
      try {
        document.body.classList.add('lhl-printing-online');
        cover = document.createElement('div');
        cover.id = 'lhl-print-cover-online';
        cover.innerHTML = '<div class="lhl-print-cover-box">🖨️ Đang mở bản in PDF...</div>';
        document.body.appendChild(cover);
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.style.opacity = '0';
        iframe.setAttribute('aria-hidden', 'true');
        document.body.appendChild(iframe);
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(html || '');
        doc.close();
        const cleanup = () => {
          try { iframe.remove(); } catch(e) {}
          try { const c = document.getElementById('lhl-print-cover-online'); if (c) c.remove(); } catch(e) {}
          restoreEditorFocusSoon();
        };
        if (iframe.contentWindow) iframe.contentWindow.onafterprint = cleanup;
        setTimeout(() => {
          try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch(e) { console.log(e); }
          setTimeout(cleanup, 1200);
        }, 500);
        return true;
      } catch (e) {
        console.log('In iframe lỗi, fallback mở tab:', e);
        const w = window.open('', '_blank');
        if (!w) {
          downloadText(html || '', 'LHL_Tool_In_PDF.html', 'text/html;charset=utf-8');
          showOnlineNotice('Trình duyệt chặn cửa sổ in. Em đã tải file HTML để thầy mở và in lại.');
          try { const c = document.getElementById('lhl-print-cover-online'); if (c) c.remove(); } catch(e) {}
          restoreEditorFocusSoon();
          return true;
        }
        w.document.open();
        w.document.write(html || '');
        w.document.close();
        setTimeout(() => { try { w.focus(); w.print(); } catch(e) {} try { const c = document.getElementById('lhl-print-cover-online'); if (c) c.remove(); } catch(e) {} restoreEditorFocusSoon(); }, 800);
        return true;
      }
    },

    async render_tikz_images() {
      showOnlineNotice('TikZ bản online Alpha chưa render bằng TeX Live cục bộ. Phần này cần backend riêng.');
      return [];
    },

    async merge_answer_excel_files() {
      // ONLINE ALPHA V12: gộp đúng bảng đáp án, không đưa nguyên HTML vào ô Excel.
      try {
        let files = [];
        if (window.showOpenFilePicker) {
          const handles = await window.showOpenFilePicker({
            multiple: true,
            types: [{ description: 'Bảng đáp án / Excel HTML', accept: {
              'text/html': ['.html', '.htm'],
              'text/plain': ['.txt', '.csv'],
              'application/vnd.ms-excel': ['.xls']
            }}]
          });
          for (const h of handles || []) files.push(await h.getFile());
        } else {
          files = await pickMultipleFiles('.html,.htm,.txt,.csv,.xls');
        }
        if (!files || !files.length) return { ok:false, cancelled:true };
        files.sort((a,b)=>String(a.name).localeCompare(String(b.name), 'vi', { numeric:true }));
        const codeMaps = {};
        let parsedFileCount = 0;
        for (const file of files) {
          let text = '';
          try { text = await file.text(); } catch(e) { text = ''; }
          const parsed = parseAnswerTableHtml(text, file.name);
          if (!parsed) continue;
          parsedFileCount++;
          for (const code of parsed.codes) {
            if (!codeMaps[code]) codeMaps[code] = { p1: [], p2: [], p3: [] };
            const src = parsed.byCode[code] || { p1: [], p2: [], p3: [] };
            ['p1','p2','p3'].forEach(part => {
              // Nếu cùng mã đề xuất hiện nhiều file thì nối tiếp nhưng hạn chế dòng trống.
              const arr = (src[part] || []).filter(v => String(v || '').trim() !== '');
              if (arr.length) codeMaps[code][part] = (codeMaps[code][part] || []).concat(arr);
            });
          }
        }
        const codes = Object.keys(codeMaps);
        if (!codes.length) {
          return { ok:false, success:false, error:'Không nhận diện được bảng đáp án trong các file đã chọn.' };
        }
        const built = buildMergedAnswerXlsFromMaps(codeMaps);
        const name = 'Bang_Dap_An_Gop.xls';
        if (window.showSaveFilePicker) {
          try {
            const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description:'Excel HTML', accept:{ 'application/vnd.ms-excel':['.xls'] } }] });
            const w = await h.createWritable(); await w.write(built.html); await w.close();
            return { ok:true, success:true, count: built.count, file_count: parsedFileCount, filename:name };
          } catch(e) { if (e && e.name === 'AbortError') return { ok:false, cancelled:true }; }
        }
        downloadText(built.html, name, 'application/vnd.ms-excel;charset=utf-8');
        return { ok:true, success:true, count: built.count, file_count: parsedFileCount, filename:name };
      } catch(e) {
        console.warn('merge_answer_excel_files online lỗi:', e);
        return { ok:false, success:false, error: e && e.message ? e.message : String(e) };
      }
    },

    async merge_selected_pdf_files() {
      try {
        const files = await pickPdfFiles(false);
        if (!files || !files.length) return { ok:false, cancelled:true };
        return await mergePdfFilesOnline(files);
      } catch(e) { return { ok:false, success:false, error: e && e.message ? e.message : String(e) }; }
    },
    async merge_pdf_files_in_folder() {
      try {
        let files = [];
        if (window.showDirectoryPicker) {
          if (typeof showFolderAccessNotice === 'function') {
            const okFolder = await showFolderAccessNotice('pdf');
            if (!okFolder) return { ok:false, cancelled:true };
          }
          const dir = await window.showDirectoryPicker({ mode:'read' });
          for await (const [name, handle] of dir.entries()) {
            if (handle.kind === 'file' && /\.pdf$/i.test(name)) files.push(await handle.getFile());
          }
        } else {
          files = await pickPdfFiles(false);
        }
        if (!files || !files.length) return { ok:false, cancelled:true };
        files.sort((a,b)=>String(a.name).localeCompare(String(b.name), 'vi', { numeric:true }));
        return await mergePdfFilesOnline(files);
      } catch(e) {
        if (e && e.name === 'AbortError') return { ok:false, cancelled:true };
        return { ok:false, success:false, error: e && e.message ? e.message : String(e) };
      }
    },
    async save_mixed_exam_package(files, answerHtml, answerName) {
      // ONLINE ALPHA V5: ưu tiên cho thầy chọn trực tiếp thư mục trên máy để lưu toàn bộ đề trộn + đáp án.
      // Chrome/Edge hỗ trợ showDirectoryPicker; nếu trình duyệt không hỗ trợ thì fallback tải từng file như V4.
      try {
        const list = Array.isArray(files) ? files : [];
        const answerFileName = safeName(answerName || 'Bang_Dap_An.xls');
        if (window.showDirectoryPicker) {
          if (typeof showFolderAccessNotice === 'function') {
            const okFolder = await showFolderAccessNotice();
            if (!okFolder) return { ok: false, success: false, cancelled: true };
          }
          const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
          for (const f of list) {
            const fileName = safeName((f && (f.filename || f.name)) || ('De_' + String(Date.now()) + '.html'));
            const handle = await dirHandle.getFileHandle(fileName, { create: true });
            const writable = await handle.createWritable();
            await writable.write((f && f.content) || '');
            await writable.close();
          }
          if (answerHtml !== undefined && answerHtml !== null) {
            const handle = await dirHandle.getFileHandle(answerFileName, { create: true });
            const writable = await handle.createWritable();
            await writable.write(String(answerHtml || '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><h2>BẢNG ĐÁP ÁN</h2></body></html>'));
            await writable.close();
          }
          showOnlineNotice('Đã lưu gói trộn đề vào thư mục thầy đã chọn.');
          return { ok: true, success: true, savedToFolder: true };
        }
      } catch (e) {
        if (e && (e.name === 'AbortError' || /abort/i.test(String(e.message || '')))) {
          return { ok: false, success: false, cancelled: true };
        }
        console.warn('Không lưu được bằng thư mục trực tiếp, fallback tải file:', e);
      }
      if (Array.isArray(files)) {
        for (const f of files) downloadText(f.content || '', (f && (f.filename || f.name)) || 'de.html', 'text/html;charset=utf-8');
      }
      if (answerHtml !== undefined && answerHtml !== null) downloadText(String(answerHtml || '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><h2>BẢNG ĐÁP ÁN</h2></body></html>'), answerName || 'Bang_dap_an.html', 'text/html;charset=utf-8');
      return { ok: true, success: true, fallbackDownload: true };
    },

    async get_google_script_url() { return localStorage.getItem('lhl_google_script_url') || ''; },
    async save_google_script_url(url) { localStorage.setItem('lhl_google_script_url', url || ''); return { success: true }; },

    async get_convert_file_config() {
      try {
        const cfg = JSON.parse(localStorage.getItem('lhl_convert_file_config') || '{}');
        const keys = (window.__lhlOnlineGeminiKeys || []);
        cfg.has_key = keys.length > 0;
        cfg.key_count = keys.length;
        cfg.masked_key = keys.length ? keys.map(k => k.slice(0,6)+'...'+k.slice(-4)).join(', ') : '';
        return cfg;
      } catch(e) { return { has_key:false, key_count:0, masked_key:'' }; }
    },
    async save_convert_file_config(apiKeys, model, fallback, dpi, pageFrom, pageTo, delay, cols, keepPdf) {
      const keys = String(apiKeys || '').split(/[\n,;]+/).map(s=>s.trim()).filter(Boolean);
      if(keys.length) window.__lhlOnlineGeminiKeys = keys;
      // BẢO MẬT ONLINE: không lưu API key vào localStorage. Reload/mở lại app sẽ phải nhập lại key.
      localStorage.setItem('lhl_convert_file_config', JSON.stringify({ model, fallback_model:fallback, fallback, dpi, pageFrom, pageTo, delay, option_columns:cols, cols, keepPdf }));
      return { ok: true, success: true, has_key:(window.__lhlOnlineGeminiKeys||[]).length>0, key_count:(window.__lhlOnlineGeminiKeys||[]).length };
    },
    async convert_pdf_file_to_html() {
      // ONLINE ALPHA V13: chuyển PDF bằng Gemini trực tiếp trong trình duyệt bằng API key người dùng nhập cho phiên hiện tại.
      try {
        const cfg = await this.get_convert_file_config();
        const keys = (window.__lhlOnlineGeminiKeys || []);
        if(!keys.length) return { ok:false, success:false, error:'Chưa có API Gemini. Thầy/Cô dán API key rồi bấm Lưu API/Cấu hình trước.' };
        let files = [];
        if (window.showOpenFilePicker) {
          const handles = await window.showOpenFilePicker({ multiple:false, types:[{ description:'PDF', accept:{ 'application/pdf':['.pdf'] } }] });
          for (const h of handles || []) files.push(await h.getFile());
        } else {
          files = await pickMultipleFiles('.pdf');
        }
        const file = files && files[0];
        if (!file) return { success:false, cancelled:true };
        if (window.lhlConvertSetStatus) window.lhlConvertSetStatus('⏳ Đã chọn PDF: '+file.name+'\nĐang gửi Gemini để gõ lại nội dung, công thức LaTeX và đáp án/đáp số...', '');
        const html = await lhlOnlineGeminiConvertFile(file, keys, cfg, 'pdf');
        const clean = lhlOnlineCleanGeminiHtml(html);
        return { ok:true, success:true, html_content:clean, body_html:clean, html:clean, filename:safeName(file.name.replace(/\.pdf$/i,'.html')), tab_title:safeName(file.name.replace(/\.pdf$/i,'')), pages:'', api_key_count:keys.length, used_api_count:1, image_count:(clean.match(/<img\b/gi)||[]).length };
      } catch(e) { if (e && e.name === 'AbortError') return { success:false, cancelled:true }; return { ok:false, success:false, error:e && e.message ? e.message : String(e) }; }
    },
    async convert_pdf_word_pair_to_html() {
      // ONLINE ALPHA V48: chọn cùng lúc 1 PDF + 1 DOCX.
      // PDF gửi Gemini gõ lại; DOCX chỉ bóc ảnh gốc rồi ghép vào placeholder trong HTML Gemini.
      try {
        const cfg = await this.get_convert_file_config();
        const keys = (window.__lhlOnlineGeminiKeys || []);
        if(!keys.length) return { ok:false, success:false, error:'Chưa có API Gemini. Thầy/Cô dán API key rồi bấm Lưu API/Cấu hình trước.' };

        const picked = await lhlV48PickPdfAndDocxFiles();
        const pdf = picked.pdf, docx = picked.docx;
        if (!pdf || !docx) {
          return { ok:false, success:false, error:'Thầy cần chọn cùng lúc đúng 1 file PDF và 1 file Word .docx.' };
        }

        if (window.lhlConvertSetStatus) window.lhlConvertSetStatus(
          '⏳ Đã chọn PDF: ' + pdf.name
          + '\n⏳ Đã chọn Word: ' + docx.name
          + '\nĐang tách ảnh gốc từ Word...',
          ''
        );

        const allImages = await lhlV48ExtractDocxImagesOrdered(docx);
        const filterPack = await lhlV49FilterTableLikeWordImages(allImages);
        const images = filterPack.kept;
        const skippedTableImages = filterPack.skipped;

        if (window.lhlConvertSetStatus) window.lhlConvertSetStatus(
          '⏳ Đã tách được ' + allImages.length + ' ảnh từ Word.\nĐã bỏ qua ' + skippedTableImages.length + ' ảnh nghi là bảng/công thức/OLE để không lệch thứ tự.\nCòn ' + images.length + ' ảnh minh họa sẽ ghép vào đề.'
          + '\nĐang gửi PDF lên Gemini để gõ lại HTML LaTeX...',
          ''
        );

        const html = await lhlOnlineGeminiConvertFile(pdf, keys, cfg, 'pdf');
        let clean = lhlOnlineCleanGeminiHtml(html);

        if (window.lhlConvertSetStatus) window.lhlConvertSetStatus(
          '⏳ Gemini đã trả HTML từ PDF.'
          + '\nĐang ghép ảnh gốc từ Word vào các khung [CHÈN ẢNH VÀO ĐÂY] theo thứ tự...',
          ''
        );

        clean = lhlV48MergeWordImagesIntoGeminiHtml(clean, images);

        const imgTagCount = (clean.match(/<img\b/gi)||[]).length;
        const phCount = (clean.match(/lhl-gemini-image-placeholder|\[\s*CHÈN\s*ẢNH/gi)||[]).length;

        if (window.lhlConvertSetStatus) window.lhlConvertSetStatus(
          '✅ Hoàn tất PDF + Word.'
          + '\nPDF đã gửi Gemini: ' + pdf.name
          + '\nẢnh gốc lấy từ Word: ' + allImages.length + '\nẢnh bỏ qua vì giống bảng/công thức: ' + skippedTableImages.length + '\nẢnh dùng để ghép: ' + images.length
          + '\nẢnh đã có trong HTML: ' + imgTagCount
          + (phCount ? '\nCòn placeholder chưa ghép: ' + phCount : '')
          + '\nBước tiếp theo: bấm nút Chuyển Word để chuẩn hóa về cấu trúc LHL.',
          'ok'
        );

        return {
          ok:true,
          success:true,
          html_content: clean,
          body_html: clean,
          html: clean,
          filename: safeName(pdf.name.replace(/\.pdf$/i,'_word_images.html')),
          tab_title: safeName(pdf.name.replace(/\.pdf$/i,'_PDF_WORD_IMG')),
          pages:'',
          api_key_count: keys.length,
          used_api_count:1,
          image_count: images.length,
          merged_image_count: imgTagCount,
          placeholder_left_count: phCount,
          pdf_word_pair:true
        };
      } catch(e) {
        if (e && e.name === 'AbortError') return { ok:false, success:false, cancelled:true };
        return { ok:false, success:false, error:e && e.message ? e.message : String(e) };
      }
    },
    async convert_word_file_to_html() {
      // ONLINE ALPHA V11: ưu tiên hộp chọn file hệ thống để lấy Word trực tiếp từ máy.
      if (window.showOpenFilePicker) {
        try {
          const [handle] = await window.showOpenFilePicker({ multiple:false, types:[{ description:'Word DOCX', accept:{ 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['.docx'] } }] });
          if (!handle) return { ok:false, success:false, cancelled:true };
          const file = await handle.getFile();
          const html = await convertDocxFileToHtml(file);
          if (!html) return { ok:false, success:false, error:'convert_failed' };
          const ed = document.getElementById('editor');
          if (ed) { ed.value = html; ed.disabled = false; if (typeof window.debounceUpdate === 'function') window.debounceUpdate(); else if (typeof window.updatePreview === 'function') window.updatePreview(); }
          return { ok:true, success:true, html_content: html, body_html: html, html, filename:safeName(file.name.replace(/\.docx$/i,'.html')), tab_title:safeName(file.name.replace(/\.docx$/i,'')) };
        } catch(e) { if (e && e.name === 'AbortError') return { success:false, cancelled:true }; console.warn('showOpenFilePicker Word lỗi, fallback input:', e); }
      }
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.docx';
        input.style.display = 'none';
        document.body.appendChild(input);
        input.onchange = async () => {
          const file = input.files && input.files[0];
          input.remove();
          if (!file) { resolve({ ok:false, success: false, cancelled:true, error: 'cancel' }); return; }
          const html = await convertDocxFileToHtml(file);
          if (!html) { resolve({ ok:false, success:false, error:'convert_failed' }); return; }
          try {
            const ed = document.getElementById('editor');
            if (ed) {
              ed.value = html;
              ed.disabled = false;
              if (typeof window.debounceUpdate === 'function') window.debounceUpdate();
              else if (typeof window.updatePreview === 'function') window.updatePreview();
            }
          } catch(e) {}
          resolve({ ok:true, success: true, html_content: html, body_html: html, html: html, filename: safeName(file.name.replace(/\.docx$/i,'.html')), tab_title:safeName(file.name.replace(/\.docx$/i,'')) });
        };
        input.click();
      });
    }
  };

  window.pywebview = window.pywebview || {};
  window.pywebview.api = Object.assign({}, api, window.pywebview.api || {}, api);

  window.LHL_ONLINE_ALPHA = true;
  window.LHL_ONLINE_ALPHA_V2 = true;
  window.LHL_ONLINE_ALPHA_V3 = true;
  window.LHL_ONLINE_ALPHA_V4 = true;
  window.LHL_ONLINE_ALPHA_V5 = true;
  window.LHL_ONLINE_ALPHA_V6 = true;
  window.LHL_ONLINE_ALPHA_V11 = true;
  window.LHL_ONLINE_ALPHA_V12 = true;
})();
