
Foody merchant universal patch v13 — 2025-08-19

Что входит:
- js/foody_fetch_xhr_rid_patch_v13.js — глобальный патч fetch/XMLHttpRequest:
  * автоматически добавляет ?restaurant_id=<RID> ко всем запросам /api/v1/merchant/offers*
  * подставляет x-foody-key из window.CONFIG при наличии
  * для DELETE 404 превращает в 200 (считаем как 'уже удалён')
- css/modal_center_fix.css — пустышка (оставлена на случай будущих правок)
- Центровка модалки #offerEditModal и flatpickr на полях дат/времени
- Страхующие клики «Редактировать/Удалить», если оригинальные обработчики не сработали

Как подключить (ВАЖНО — порядок):
1) В index.html СРАЗУ ПОСЛЕ <script src="/config.js"></script> ДО app.js добавить:
   <script src="./js/foody_fetch_xhr_rid_patch_v13.js?v=1"></script>

2) (опционально) В <head> или внизу страницы:
   <link rel="stylesheet" href="./css/modal_center_fix.css">

RID берётся из:
- localStorage.restaurant_id (или restaurantId / rid)
- <meta name="restaurant_id" content="...">
- query (?restaurant_id=... или ?rid=...)
- [data-restaurant-id] на любом элементе

Проверка:
- Открой DevTools → Network. При Delete должен уходить запрос вида:
  DELETE .../api/v1/merchant/offers/XX?restaurant_id=YY
- Если бэк вернёт 404, UI всё равно уберёт карточку (как 'уже удалён').
