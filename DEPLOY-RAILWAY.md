# FlowDesk — Деплой на Railway
# ════════════════════════════════════════

## ШАГ 1 — Загрузи проект на GitHub

1. Зайди на github.com → New repository
2. Назови "flowdesk" → Create repository
3. На своём компьютере:

```bash
# Распакуй архив flowdesk-railway.zip
# Зайди в папку
cd flowdesk

# Инициализируй git и загрузи
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/ТВОЙusername/flowdesk.git
git push -u origin main
```

## ШАГ 2 — Создай проект на Railway

1. Зайди на railway.app
2. Войди через GitHub
3. «New Project» → «Deploy from GitHub repo»
4. Выбери репо "flowdesk"
5. Railway начнёт деплой автоматически

## ШАГ 3 — Добавь PostgreSQL

1. В проекте Railway нажми «+ New» → «Database» → «PostgreSQL»
2. Railway автоматически добавит переменную DATABASE_URL в твой сервис

## ШАГ 4 — Добавь переменные окружения

В Railway: твой сервис → «Variables» → добавь:

```
NODE_ENV=production
JWT_SECRET=сгенерируй-случайную-строку-32-символа
CLIENT_URL=https://ТВОЙ-ДОМЕН.up.railway.app
```

JWT_SECRET можно сгенерировать здесь:
https://generate-secret.vercel.app/32

## ШАГ 5 — Получи домен

1. Railway → Settings → Networking → Generate Domain
2. Скопируй URL вида https://flowdesk-production-xxxx.up.railway.app
3. Вставь его в переменную CLIENT_URL

## ШАГ 6 — Готово!

Открой свой URL — увидишь лендинг FlowDesk.
Нажми «Создать команду» → зарегистрируйся как тимлид.

## Telegram бот

После регистрации:
1. Сайдбар → «✈ Telegram Бот» → «Настройка»
2. Вставь токен от @BotFather
3. Включи бота — он запустится без перезапуска сервера

## Обновление

```bash
# После изменений в коде:
git add .
git commit -m "Update"
git push
# Railway автоматически передеплоит
```
