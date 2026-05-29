# FlowDesk — Деплой на Hostinger VPS
# ════════════════════════════════════════════════════════════

## Требования
- VPS с Ubuntu 22.04 (минимум 1GB RAM, 20GB SSD)
- Node.js 20+
- Nginx
- PM2
- Домен (можно купить на Hostinger)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ШАГ 1 — Подключись к серверу
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ssh root@YOUR_SERVER_IP

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ШАГ 2 — Установи Node.js и PM2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm install -g pm2
mkdir -p /var/log/flowdesk

# Проверь версии
node -v    # должно быть v20+
npm -v
nginx -v

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ШАГ 3 — Загрузи проект
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Способ 1: загрузи ZIP через FileZilla или scp
scp flowdesk.zip root@YOUR_SERVER_IP:/var/www/

# Разархивируй
cd /var/www
unzip flowdesk.zip -d flowdesk
cd flowdesk

# Способ 2: если есть Git
cd /var/www
git clone YOUR_REPO_URL flowdesk
cd flowdesk

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ШАГ 4 — Настрой переменные окружения
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cd /var/www/flowdesk
cp .env.example .env
nano .env

# Заполни:
#   JWT_SECRET=      (случайная строка 32+ символа)
#   CLIENT_URL=      https://YOUR_DOMAIN
#   KEITARO_URL=     https://your-keitaro.com  (если есть)
#   KEITARO_API_KEY= (если есть)
# Telegram заполнишь позже через интерфейс

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ШАГ 5 — Установи зависимости и собери фронтенд
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cd /var/www/flowdesk

# Бэкенд
npm install

# Фронтенд
cd client
npm install
npm run build
cd ..

# Инициализация базы данных
node server/db/migrate.js

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ШАГ 6 — Запусти через PM2
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pm2 start ecosystem.config.js
pm2 save
pm2 startup  # следуй инструкции — автозапуск при перезагрузке

# Проверь что работает
pm2 status
pm2 logs flowdesk --lines 20

# Проверь API
curl http://localhost:3001/api/health

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ШАГ 7 — Настрой Nginx
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Скопируй конфиг
cp /var/www/flowdesk/nginx.conf /etc/nginx/sites-available/flowdesk

# Отредактируй — замени YOUR_DOMAIN на свой домен
nano /etc/nginx/sites-available/flowdesk

# Активируй
ln -s /etc/nginx/sites-available/flowdesk /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default  # убери дефолтный
nginx -t                              # проверь синтаксис
systemctl restart nginx

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ШАГ 8 — SSL сертификат (HTTPS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

sudo apt install certbot python3-certbot-nginx -y
certbot --nginx -d YOUR_DOMAIN
# Следуй инструкции — certbot сам обновит nginx.conf

# Автообновление (уже настроено certbot-ом, проверь):
certbot renew --dry-run

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ШАГ 9 — Откройте сайт
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Зайди на https://YOUR_DOMAIN
→ Увидишь лендинг FlowDesk
→ Нажми «Создать команду»
→ Зарегистрируйся как тимлид
→ Всё!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Обновление после изменений
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cd /var/www/flowdesk
git pull                  # если через git
cd client && npm run build && cd ..
pm2 restart flowdesk

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Полезные команды
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pm2 logs flowdesk          # логи в реальном времени
pm2 restart flowdesk       # перезапуск
pm2 stop flowdesk          # остановка
systemctl status nginx     # статус nginx
tail -f /var/log/flowdesk/err.log  # ошибки

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## Настройка Telegram бота
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Зайди в приложение как тимлид
2. Сайдбар → «✈ Telegram Бот» → таб «Настройка»
3. Вставь токен от @BotFather
4. Включи бота
5. Таб «Chat ID» — каждый пишет /start боту, вставляешь ID
6. Таб «Алерты» — выбери пороги
7. Таб «Дайджест» — выбери интервал и топ-N

Бот сразу начнёт работать — без перезапуска сервера.
