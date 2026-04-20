# MAXX Project – Tài liệu Context & API dùng cho Module

Tài liệu này mô tả **chuẩn kiến trúc**, **vòng đời module**, và **các API có thể sử dụng thông qua `ctx`** trong toàn bộ dự án MAXX. Mục tiêu là giúp phát triển module mới **nhanh – đúng – không lỗi kiến trúc**.

---

## 1. Tổng quan kiến trúc

### 1.1 Luồng khởi động

1. **Bootstrap (`src/index.js`)**

   * Chạy ở mọi page / iframe.
   * Lọc module theo `config` (enabled, match, exclude, iframe).
   * Gọi `run(ctx)` cho mỗi module hợp lệ.

2. **Module (`run(ctx)`)**

   * Nhận **context duy nhất** từ bootstrap.
   * Không giao tiếp trực tiếp với module khác.
   * Tự quản lý vòng đời (init / re-enter / cleanup).

3. **Helper (`ctx.siem`, helpers khác)**

   * Stateless.
   * Không lưu global state.
   * Không sync cross-tab.

---

## 2. Context (`ctx`) trong module

Mỗi module được gọi với một object `ctx` có cấu trúc:

```ts
interface ModuleContext {
  url: string;        // URL page (TOP nếu đang ở iframe)
  isIframe: boolean;  // true nếu module đang chạy trong iframe
  env: 'dev' | 'tampermonkey';

  siem: SiemContext;  // Helper cho SIEM / iframe
}
```

---

## 3. `ctx.siem` – SIEM Frame Helper (STATELESS)

### 3.1 Triết lý

* **Không có activeFrame global**
* **Iframe visible = điều kiện active**
* **Mỗi tab độc lập**

Module **KHÔNG nên**:

* dùng localStorage / sessionStorage để xác định iframe
* giả định iframe reload

---

### 3.2 API chi tiết

#### `ctx.siem.getSelfFrameId()`

```ts
(): string | null
```

* Trả về `id` của iframe hiện tại.
* Ở TOP window → `null`.

**Ví dụ:**

```js
const frameId = ctx.siem.getSelfFrameId();
if (frameId !== 'PAGE_SEM') return;
```

---

#### `ctx.siem.isSelfFrame(frameId)`

```ts
(frameId: string): boolean
```

* Check nhanh iframe hiện tại có đúng `frameId` không.

**Ví dụ:**

```js
if (!ctx.siem.isSelfFrame('PAGE_EVENTVIEWER')) return;
```

---

#### `ctx.siem.isTopWindow()`

```ts
(): boolean
```

* True nếu module đang chạy ở TOP window.

---

#### `ctx.siem.onFrameVisibleChange(callback)`

```ts
(callback: (frameId: string, visible: boolean) => void): () => void
```

* Lắng nghe khi iframe **hiển thị / bị ẩn** trong UI SIEM.
* Chỉ áp dụng cho **tab hiện tại**.

**Ví dụ:**

```js
ctx.siem.onFrameVisibleChange((frameId, visible) => {
  if (frameId === 'PAGE_SEM' && visible) {
    initOrReenter();
  }
});
```

---

#### `ctx.siem.getVisibleFrames()`

```ts
(): string[]
```

* Trả về danh sách iframe đang visible trong tab.

---

#### `ctx.siem.scope(rootFrameId, options, handler)`

```ts
(
  rootFrameId: string | null,
  options: {
    self?: boolean;
    children?: boolean;
    deep?: boolean;
  },
  handler: (ctx: {
    window: Window;
    document: Document;
    frameElement: HTMLIFrameElement | null;
    id: string | null;
    depth: number;
  }) => void
): void
```

* Traverse iframe tree bắt đầu từ `rootFrameId`.
* **Không phụ thuộc iframe active**.

**Ví dụ:**

```js
ctx.siem.scope('PAGE_SEM', { self: true }, ({ document }) => {
  // thao tác DOM trong iframe PAGE_SEM
});
```

---

## 4. Pattern chuẩn cho module

### 4.1 Module chỉ chạy trong iframe cố định

```js
export default function run(ctx) {
  if (!ctx.siem.isSelfFrame('PAGE_EVENTVIEWER')) return;
  init();
}
```

---

### 4.2 Module cần active lại khi iframe hiển thị

```js
export default function run(ctx) {
  let initialized = false;

  ctx.siem.onFrameVisibleChange((frameId, visible) => {
    if (frameId !== 'PAGE_SEM' || !visible) return;

    if (!initialized) {
      initialized = true;
      init();
    } else {
      reEnter();
    }
  });
}
```

---

### 4.3 Module chạy ở TOP nhưng thao tác iframe

```js
export default function run(ctx) {
  ctx.siem.onFrameVisibleChange((frameId, visible) => {
    if (frameId !== 'PAGE_SEM' || !visible) return;

    ctx.siem.scope('PAGE_SEM', { self: true }, ({ document }) => {
      injectButton(document);
    });
  });
}
```

---

## 5. Quy tắc vàng khi viết module

* ❌ Không lưu activeFrame global
* ❌ Không dùng storage để sync iframe
* ❌ Không giả định iframe reload
* ✅ Luôn dựa vào **iframe visibility**
* ✅ Module tự quản state
* ✅ Scope chỉ dùng khi cần thao tác iframe khác

---

## 6. Checklist khi review module mới

* [ ] Có phụ thuộc state global không?
* [ ] Có chạy lại khi iframe hiển thị không?
* [ ] Có cleanup observer khi iframe bị ẩn không?
* [ ] Có chạy đúng iframe không?

---

## 7. Kết luận

Kiến trúc MAXX mới:

* **Stateless**
* **Tab-safe**
* **UI-driven**

Giúp dự án:

* Dễ mở rộng module
* Không lỗi cross-tab
* Debug dễ

---

> Đây là tài liệu nền tảng. Mọi module mới **bắt buộc** tuân theo tài liệu này.
