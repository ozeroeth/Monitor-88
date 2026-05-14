# Monitor88 Telegram Bot

Telegram bot yang mengintegrasikan **985monitor.xyz** — realtime crypto/twitter/NFT alerts langsung ke Telegram. 100% gratis, tanpa API key, tanpa wallet login.

## Fitur

| Fitur | Deskripsi |
|-------|-----------|
| 🐦 Twitter Alerts | Realtime tweet dari 95+ akun crypto (CZ, Trump, dll) |
| 🟡 Binance Square | Post dari akun Binance Square |
| 🇺🇸 Truth Social | Post Trump & lainnya |
| 🎨 NFT Mint | Alert ERC721/ERC1155 mint di ETH |
| 📊 FOMO KOL | Leaderboard 1065+ KOL wallet (PnL, volume) |
| 🔍 Wallet Lookup | Cari real wallet Solana/EVM dari handle KOL |
| 🪙 Token Info | Cek harga, mcap, liquidity dari contract address |
| 🔇 Mute/Filter | Mute handle, filter by keyword |

## Arsitektur

```
985monitor.xyz ──SSE──→ Bot ──→ Telegram Users
                        ↑
              Polling fallback (60s)
              FOMO cache (1 jam)
              NFT feed (30s)
```

---

## Setup (5 Menit)

### 1. Buat Telegram Bot

1. Buka [@BotFather](https://t.me/BotFather) di Telegram
2. Kirim `/newbot`
3. Ikuti instruksi, beri nama bot
4. Copy **token** yang diberikan (format: `123456789:ABCdef...`)

### 2. Clone & Install

```bash
git clone https://github.com/ozeroeth/Monitor-88.git
cd Monitor-88/bot
npm install
```

### 3. Konfigurasi

```bash
cp .env.example .env
nano .env
```

Edit `.env`:

```env
# WAJIB: Token dari BotFather
BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ

# OPTIONAL: Batasi hanya chat ID tertentu (comma separated)
# Kosongkan = semua orang bisa pakai
# Cara dapat chat ID: kirim pesan ke bot, cek log di terminal
ALLOWED_CHAT_IDS=

# Tidak perlu diubah (default sudah benar)
API_BASE=https://985monitor.xyz
POLL_INTERVAL_MS=60000
NFT_POLL_INTERVAL_MS=30000
FOMO_CACHE_INTERVAL_MS=3600000
SSE_RECONNECT_DELAY_MS=5000
```

### 4. Jalankan

```bash
npm start
```

Output yang benar:

```
🚀 Monitor88 Bot starting...
   API: https://985monitor.xyz
   Poll: 60000ms | NFT: 30000ms | FOMO: 3600000ms
[SSE] Connected to https://985monitor.xyz/api/events-stream
[FOMO] Cache started, refresh every 3600s
[NFT] Feed started, interval=30000ms
[Poller] Started, interval=60000ms
✅ Bot @your_bot_name is running!
```

### 5. Test di Telegram

Buka bot kamu di Telegram, kirim:
- `/start` — menu
- `/status` — cek semua sistem
- `/fomo 24h` — lihat KOL leaderboard

---

## Deployment GRATIS (Tanpa VPS!)

### Opsi A: Laptop/PC Sendiri (Paling Mudah)

Bot jalan selama terminal terbuka. Matikan laptop = bot mati.

```bash
cd Monitor-88/bot
npm start
# Biarkan jalan, jangan tutup terminal
```

Untuk Windows: pakai PowerShell/CMD, biarkan window terbuka.

---

### Opsi B: Koyeb (GRATIS, 24/7, Recommended)

**Koyeb** = cloud hosting gratis, bot nyala 24/7 tanpa bayar.

**Step-by-step:**

1. **Push repo ke GitHub kamu** (fork atau push fresh)

2. **Sign up [koyeb.com](https://app.koyeb.com/auth/signup)** — bisa pakai GitHub login

3. **Create New Service:**
   - Source: GitHub
   - Repository: pilih repo kamu
   - Branch: `main`
   - Builder: Docker
   - Dockerfile path: `bot/Dockerfile`
   - Instance: Free (Nano)
   - Region: Washington DC (terdekat ke 985monitor)

4. **Set Environment Variables di Koyeb:**
   ```
   BOT_TOKEN = (token dari BotFather)
   API_BASE = https://985monitor.xyz
   PORT = 8000
   ```

5. **Deploy** — tunggu 2-3 menit, selesai!

6. **Health check URL:** `https://your-app.koyeb.app/health`

---

### Opsi C: Railway ($5 credit gratis 30 hari)

1. Sign up [railway.app](https://railway.app) 
2. New Project → Deploy from GitHub
3. Pilih folder `bot/`
4. Set env variable `BOT_TOKEN`
5. Deploy — gratis 30 hari

---

### Opsi D: PC Lama / Raspberry Pi (Rp 0)

Kalau punya PC bekas / Raspberry Pi yang bisa nyala 24/7:

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone & setup
git clone https://github.com/ozeroeth/Monitor-88.git
cd Monitor-88/bot && npm install
cp .env.example .env && nano .env  # isi BOT_TOKEN

# Jalankan permanen dengan PM2
sudo npm install -g pm2
pm2 start src/index.js --name monitor88
pm2 save
pm2 startup
```

Listrik Raspberry Pi: ~Rp 15rb/bulan.

---

### Opsi E: VPS Murah (kalau mau paling stabil)

| Provider | Harga | Spek |
|----------|-------|------|
| RackNerd | $22/tahun | 1 CPU, 1GB RAM |
| Hetzner | €3.79/bln | 2 CPU, 4GB RAM |
| Vultr | $5/bln | 1 CPU, 1GB RAM |

Setup VPS (systemd):

```bash
# Install Node, clone, setup .env (sama seperti Opsi D)
# Lalu:

sudo tee /etc/systemd/system/monitor88-bot.service << 'EOF'
[Unit]
Description=Monitor88 Telegram Bot
After=network.target
[Service]
Type=simple
WorkingDirectory=/root/Monitor-88/bot
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable monitor88-bot
sudo systemctl start monitor88-bot
sudo journalctl -u monitor88-bot -f
```

---

## Commands Reference

| Command | Fungsi |
|---------|--------|
| `/start` | Menu utama |
| `/status` | Health check sistem |
| `/subscribe [type]` | Set subscription: all, twitter, square, truth, news, alpha |
| `/filter add <kw>` | Tambah keyword filter |
| `/filter remove <kw>` | Hapus keyword filter |
| `/filter clear` | Hapus semua filter |
| `/mute @handle` | Mute akun (skip notif) |
| `/unmute @handle` | Unmute akun |
| `/watchlist` | Lihat 95+ akun yang dimonitor |
| `/token 0x...` | Info token dari DEX |
| `/nft` | Lihat NFT mint terbaru |
| `/nft on` | Enable NFT push alerts |
| `/nft off` | Disable NFT push alerts |
| `/fomo 24h` | Top 10 KOL PnL 24 jam |
| `/fomo 7d` | Top 10 KOL PnL 7 hari |
| `/fomo 30d` | Top 10 KOL PnL 30 hari |
| `/fomo all` | Top 10 KOL all-time |
| `/fomo social` | Top 10 KOL by mutual follows |
| `/wallet @handle` | Cari real wallet dari KOL handle |
| `/stop` | Pause semua notifikasi |
| `/resume` | Resume notifikasi |

---

## Cara Kerja

### Realtime (SSE)
Bot konek ke `985monitor.xyz/api/events-stream` via Server-Sent Events. Setiap event baru langsung di-forward ke subscriber yang cocok.

### Fallback (Polling)
Kalau SSE disconnect, bot polling REST endpoint setiap 60 detik. Kalau SSE sehat, polling cuma jalan setiap 5 menit sebagai safety net.

### Deduplication
Setiap event punya `key` unik. Bot track 2000 key terakhir — kalau sudah pernah kirim, skip.

### Filter Logic
1. Cek subscription (type match?)
2. Cek mute list (handle not muted?)
3. Cek keyword filter (jika ada filter, text harus mengandung keyword)

### FOMO Data
Fetch halaman `/fomo/` setiap 1 jam, parse JSON inline (1065+ KOL). Data offline, tidak butuh auth.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Bot tidak merespon | Cek BOT_TOKEN benar, jalankan ulang |
| Tidak ada notifikasi | Kirim `/subscribe all` lalu `/resume` |
| "fetch failed" di log | VPS tidak bisa akses internet, cek DNS |
| Duplicate messages | Restart bot, dedup akan reset |
| NFT alerts terlalu banyak | `/nft off` untuk matikan |
| FOMO data kosong | Tunggu 1 menit setelah start (loading) |

---

## File Structure

```
bot/
├── .env.example        # Template config
├── .gitignore
├── package.json
├── README.md
└── src/
    ├── index.js        # Main entry, wires everything
    ├── sse.js          # SSE realtime listener
    ├── poller.js       # REST polling fallback
    ├── fomo.js         # FOMO KOL data cache
    ├── nft.js          # NFT mint feed
    ├── formatter.js    # Telegram message formatting
    ├── state.js        # User state (subs/filters/mutes)
    └── dedup.js        # Event deduplication
```

---

## Catatan Penting

- **100% GRATIS** — tidak butuh API key apapun
- **Tidak perlu wallet login** — hanya consume public API
- **Privat** — jalankan di VPS sendiri, data tidak dibagi
- **Ringan** — RAM < 100MB, CPU minimal
- Jangan spam API (SSE sudah realtime, polling hanya backup)
- Data FOMO update setiap jam dari sisi 985monitor

---

## License

MIT — Personal use. Data belongs to 985monitor.xyz and fomo.family respectively.
