Foody v17 — Merchant FIX (Офферы)
=================================

Что исправлено:
1) Кнопка «Редактировать» — добавлена прямо в таблицу (app.js: renderOffers).
2) Удаление (404) — обрабатывается мягко: если оффер уже удалён, строка убирается без ошибки.
3) "Мигание" списка — предотвращено:
   • введён флаг state._offersLoading в loadOffers(), чтобы не гонять параллельные запросы;
   • стабильные скелетоны, без лишних перерисовок;
   • offers_edit_delete.js переписан без дублей логики.

Что в архиве:
- web/web/merchant/index.html                  (авто‑подключение offers_actions.patch.css)
- web/web/merchant/app.js                      (ПАТЧ: renderOffers / loadOffers / delegated edit+delete)
- web/web/merchant/offers_edit_delete.js       (ПАТЧ: стабильная логика списка + PATCH/DELETE)
- web/web/merchant/offers_actions.patch.css    (ПАТЧ-стили: видимость кнопок и сетка строки)

Как накатить на Railway (WEB):
1) Замените папку web/web/merchant на содержимое архива.
2) Перезапустите веб-сервис (Railway: Deploy → Restart).
3) Откройте /web/merchant → вкладка «Офферы»:
   - у каждой строки видны «Редактировать» и «Удалить»;
   - редактирование открывает модалку, сохраняет по PATCH и обновляет список без перезагрузки;
   - удаление не валится 404 (если оффер уже удалён — просто убирается строка).

Требования окружения (без изменений):
- window.foodyApi или window.__FOODY__.FOODY_API (по умолчанию прод-адрес).
- localStorage: foody_restaurant_id, foody_key (как в v17).
