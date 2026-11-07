# پک اپتیک

دورهٔ اپتیک — دانشگاه فرهنگیان، تابستان ۱۴۰۵

## ساختار Pack

| فایل                 | نقش                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| `data.js`            | `course` + `categories` و ثبت source Pack؛ جلسه‌ها را از `CourseRuntime.getUnits("optics", "sessions")` می‌گیرد |
| `sessions/sNN.js`    | داده‌های هر جلسه (`s00`–`s18`)؛ با `CourseRuntime.registerUnit` خودش را ثبت می‌کند                              |
| `widgets/_shared.js` | توابع مشترک ویجت‌ها (`wpal`، `wl2rgb`)                                                                          |
| `widgets/<key>.js`   | هر ویجت یک فایل (`mirror`، `lens`، …)؛ با `registerPackSource("optics", { widgets })` ثبت می‌شود                |
| `problems.js`        | `problems` + `problemSections` + `problemNote`                                                                  |

Engine این فایل‌ها را مستقیماً به متغیرهای global تبدیل نمی‌کند؛ `Loader` آن‌ها را به `PackData` نسخهٔ ۲ normalize و validate می‌کند.

## وضعیت

- ۱۸ جلسه
- متن مفصل برای جلسات ۲ تا ۱۸
- ۸ ویجت تعاملی
- مسائل ساختارمند؛ `problemRefs` به‌صورت خودکار از `problems[].refs` مشتق می‌شود
- نقشهٔ گراف مفهومی: خالی (نیاز به داده دارد)

## منبع

کتاب‌های مرجع در `course.books`.

## نکته‌ها

- `data.js` بزرگ است (~۱۸۵k توکن). برای تحلیل بخشی از آن، بهتر است روی session یا range محدود کار شود.
- template literalهای `RAW\`...\``را با Prettier فرمت نکن؛ مسیر`src/packs/\*_/_.js`در`.prettierignore` مستثنی شده است.
