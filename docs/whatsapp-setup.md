# WhatsApp module: setting up your own numbers

The app sends WhatsApp messages through **Evolution API**, an open-source server
(https://github.com/EvolutionAPI/evolution-api). It links ordinary WhatsApp numbers by QR scan,
the same way WhatsApp Web does. You don't pay per message, only for the server.

> Linking numbers this way isn't WhatsApp's official Business API, so WhatsApp can block a number
> that sends a lot. The app limits each number per day, pauses between messages and spreads
> messages across numbers, but no setting can promise a number won't be blocked.

## 1. A small server (about $5–6 a month)
- Any Ubuntu VPS with 2 GB RAM works (Hetzner, Contabo, DigitalOcean, Vultr…).
- Point a subdomain at it, e.g. `wa.yourschool.pk`.

## 2. Install Evolution API with Docker
```bash
curl -fsSL https://get.docker.com | sh
mkdir -p ~/evolution && cd ~/evolution
```
Create `docker-compose.yml`:
```yaml
services:
  evolution:
    image: atendai/evolution-api:v2.2.3
    restart: always
    ports: ["8080:8080"]
    environment:
      - AUTHENTICATION_API_KEY=CHANGE_ME_TO_A_LONG_RANDOM_KEY
      - SERVER_URL=https://wa.yourschool.pk
      - DATABASE_ENABLED=false
      - CACHE_LOCAL_ENABLED=true
    volumes: ["evolution_instances:/evolution/instances"]
volumes:
  evolution_instances:
```
```bash
docker compose up -d
```
Put HTTPS in front of it (e.g. Caddy: `wa.yourschool.pk { reverse_proxy localhost:8080 }`).

## 3. Connect the app (Vercel → Settings → Environment Variables)
| Name | Value |
|---|---|
| `EVOLUTION_URL` | `https://wa.yourschool.pk` |
| `EVOLUTION_KEY` | the `AUTHENTICATION_API_KEY` above |
| `CRON_SECRET` | any long random text |
| `SUPABASE_SERVICE_ROLE_KEY` | (already set) |

Redeploy after adding them.

## 4. Link numbers
In the app, go to **WhatsApp → Numbers → Add a number**. On the phone, open WhatsApp →
**Settings → Linked devices → Link a device**, then scan the QR. Repeat for each number (5–6 is a good number).

## 5. Messages through the day (optional, free)
Vercel's free plan runs the flows once a day, at 9 am. To send throughout the day, create a free job on
https://cron-job.org that opens this address every 10 minutes:
```
https://YOUR-APP/api/cron/flows?key=YOUR_CRON_SECRET
```

## Keeping numbers safe
- Use numbers that are a few months old and in normal use, not brand-new SIMs.
- Keep 100–150 messages a day on each number.
- Ask parents to save the school's number, and only message families who gave you their number.
- Personalise messages ({student}, {amount}); identical bulk text gets flagged faster.
- If a number is blocked, the app marks it and carries on with the others.
