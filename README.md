# Pandal Finder — West Bengal (Full-stack React)

A runnable React + Express project for exploring a directory of Durga Puja pandal listings across West Bengal. Includes an interactive OpenStreetMap view, clustered markers, live device location, nearby sorting, search and district filters, approximate-area exploration, Google Maps directions, published-source links for selected listings, and a community suggestion queue backed by the server.

## Requirements

- Node.js 20 or newer (Node 22 LTS recommended)
- npm
- Internet connection for initial package installation and OpenStreetMap tiles

## Run locally

1. Extract the ZIP file and open a terminal in the extracted `pandal-finder-fullstack` folder.
2. Install the dependencies:

   ```bash
   npm install
   ```

On Windows, you can instead double-click `start-windows.bat`. On macOS/Linux, run `./start-mac-linux.sh`.

3. Start the React development server and API together:

   ```bash
   npm run dev
   ```

4. Open <http://localhost:5173>.

The React UI runs on port 5173. The Express API runs on port 3001 and is proxied by Vite. Keep the terminal running while you use the site.

## Production run

```bash
npm install
npm run build
npm start
```

Open <http://localhost:3001>. Express serves the built React app and API from one port.

## Location and map notes

- On first visit, GPS is requested only when you tap **Find pandals near me** or **Use live location**; the app does not surprise-prompt on page load. If this browser previously granted geolocation permission, the app restores location automatically. Your position is processed in the browser and is not sent to the backend API.
- The app first requests a high-accuracy fix and then falls back to a faster lower-accuracy fix if the first attempt times out. It continues watching for movement and draws an accuracy circle around the GPS marker.
- Browser geolocation is supported on `localhost` and secure HTTPS sites. For a deployed site, configure HTTPS.
- If GPS is blocked, open Chrome’s site controls beside the address bar, set **Location** to **Allow**, refresh, then press **Use live location**. Also check macOS **System Settings → Privacy & Security → Location Services** and allow location for your browser.
- If GPS is unavailable, use **Choose an area** for an approximate reference point. This is not live GPS. The distance filter and ranking work from GPS or the selected-area reference point.
- Map tiles come from OpenStreetMap and require internet access. Follow the tile provider's usage policy if this project is deployed publicly at scale.
- Distance is straight-line distance, not road distance. Directions open Google Maps using the pandal's name and area.

## Seed data quality

The included seed data currently contains 196 entries. Twenty-seven names link to published guides; this does not independently verify their exact coordinates, entrances, 2026 operation or opening times. Many entries remain unverified or have approximate pins, and this is not a complete or official register of all pandals in West Bengal. Some 2026 themes are copied from published guides and may change; confirm details locally before travelling. Source links and coordinate-source links are included on selected map popups. Suggestions are saved for review and do not immediately appear in the public listing.

## Community suggestions and server storage

Submissions from **Suggest a pandal** are saved to `server/data/suggestions.json`. The seed directory is stored in `server/data/pandals.json`; changes made through the admin API persist in these JSON files. Back up these files before updating or redeploying. This JSON-backed store is suitable for a demo or a small deployment; use a managed database and rate limiting for high-traffic production deployments.

## Protected admin API

Do not put an admin token in frontend code or commit your `.env` file. Copy `.env.example` to `.env`, then set a long random `ADMIN_TOKEN` before using admin routes:

```text
ADMIN_TOKEN=put-a-long-random-secret-here
PORT=3001
```

Restart the API after changing `.env`. Send the token in an `X-Admin-Token` header. Replace the example token with a randomly generated secret and do not expose the admin API directly to untrusted clients.

### View pending submissions

```bash
curl http://localhost:3001/api/admin/suggestions \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN"
```

### Add a verified listing

```bash
curl -X POST http://localhost:3001/api/admin/pandals \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
  -d '{"name":"Example Sarbojanin","area":"Example locality","district":"Kolkata","lat":22.57,"lng":88.36,"theme":"Community Puja","locationPrecision":"approximate","seasonStatus":"unconfirmed"}'
```

### Approve a suggestion

Use the suggestion ID from the pending list. Approval requires valid `lat` and `lng` in the body; the server will create a public listing and mark the submission approved.

```bash
curl -X PATCH http://localhost:3001/api/admin/suggestions/SUGGESTION_ID \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
  -d '{"status":"approved","lat":22.57,"lng":88.36}'
```

### Update or delete a listing

```bash
curl -X PATCH http://localhost:3001/api/admin/pandals/PANDAL_ID \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
  -d '{"theme":"Updated details","seasonStatus":"confirmed"}'

curl -X DELETE http://localhost:3001/api/admin/pandals/PANDAL_ID \
  -H "X-Admin-Token: YOUR_ADMIN_TOKEN"
```

## API endpoints

- `GET /api/health` — service status and listing count
- `GET /api/pandals` — all listings; supports `?q=...&district=...`
- `GET /api/pandals/:id` — one listing
- `GET /api/areas` — approximate map centres for included areas
- `POST /api/suggestions` — save a community listing for review
- `GET /api/admin/suggestions` — protected review queue
- `PATCH /api/admin/suggestions/:id` — protected approve/reject/pending action
- `POST /api/admin/pandals` — protected create
- `PATCH /api/admin/pandals/:id` — protected update
- `DELETE /api/admin/pandals/:id` — protected delete

## Project structure

```text
client/                  React + Vite UI
  src/App.jsx             Main page, filters, geolocation, forms
  src/components/         Interactive Leaflet map and marker clustering
  src/styles.css          Responsive styling
server/index.js           Express API + production static hosting
server/storage.js         JSON storage helpers
server/data/pandals.json  Seed directory + persistent listing store
server/data/area-centres.json
server/data/suggestions.json  Created automatically on first submission
```

## GPS troubleshooting

If the page shows dashes for distances, the browser has not provided a location yet. Press **Use live location** and allow the request. If permission is denied, change the site Location permission in Chrome and retry. The browser may report an approximate location depending on your device, Wi-Fi, and macOS settings. When using **Choose an area**, the app intentionally labels it as an approximate area centre rather than GPS.

The **Explore West Bengal** action resets GPS/area mode and filters, then zooms back out to the full directory. Search/filter changes no longer snap the map viewport back to the current location.

## Useful checks

```bash
npm run check
curl http://localhost:3001/api/health
```
