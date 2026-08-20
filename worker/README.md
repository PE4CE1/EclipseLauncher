# 🚀 Eclipse Launcher – Cloudflare D1 & Worker Backend Setup

Diese Anleitung zeigt dir Schritt für Schritt, wie du die Cloudflare D1 Datenbank und den Cloudflare Worker in weniger als 3 Minuten kostenlos erstellst und bereitstellst.

---

## 📋 Voraussetzungen

1. Ein kostenloser Account auf [Cloudflare.com](https://dash.cloudflare.com/)
2. Node.js auf deinem Computer installiert

---

## 🛠️ Schritt 1: Bei Cloudflare einloggen

Öffne ein Terminal (z. B. PowerShell oder VS Code Terminal) im Ordner `worker/`:

```bash
cd worker
npx wrangler login
```
*(Es öffnet sich ein Browser-Fenster – klicke einfach auf **Allow / Autorisieren**).*

---

## 🗄️ Schritt 2: Cloudflare D1 Datenbank erstellen

Führe folgenden Befehl aus:

```bash
npx wrangler d1 create eclipse-db
```

Du erhältst eine Ausgabe wie diese:
```text
✅ Successfully created DB 'eclipse-db'!
Add the following to your wrangler.toml to connect to it:

[[d1_databases]]
binding = "DB"
database_name = "eclipse-db"
database_id = "xxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Kopiere die **`database_id`** und füge sie in deine Datei `worker/wrangler.toml` ein:

```toml
[[d1_databases]]
binding = "DB"
database_name = "eclipse-db"
database_id = "DEINE_KOPIERTE_DATABASE_ID"
```

---

## 📦 Schritt 3: Tabellen in D1 initialisieren

Führe folgenden Befehl aus, um das Datenbankschema (`schema.sql`) auf Cloudflare zu erstellen:

```bash
npx wrangler d1 execute eclipse-db --file=./schema.sql --remote
```

---

## 🚀 Schritt 4: Worker veröffentlichen (Deploy)

Führe nun den Deploy-Befehl aus:

```bash
npx wrangler deploy
```

Nach wenigen Sekunden erhältst du deine fertige Worker-URL, z. B.:
`https://eclipse-social-api.DEIN-SUBDOMAIN.workers.dev`

---

## 🔗 Schritt 5: URL im Eclipse Launcher hinterlegen

Kopiere die erhaltene URL (z. B. `https://eclipse-social-api.DEIN-SUBDOMAIN.workers.dev`) in deine `src/services/socialService.ts` als Standard-URL:

```typescript
export const DEFAULT_SOCIAL_API_URL = 'https://eclipse-social-api.DEIN-SUBDOMAIN.workers.dev'
```

Fertig! Dein Launcher nutzt ab jetzt die blitzschnelle Cloudflare D1 Edge-Datenbank! 🎉
