/**
 * Build-time Xtream data fetcher.
 * Run BEFORE building the Windows app to embed live playlist data.
 * Usage: node scripts/fetch-xtream-data.js
 *
 * Reads credentials from:
 *   1. Command line: --url=... --user=... --pass=...
 *   2. Environment: XTREAM_URL, XTREAM_USER, XTREAM_PASS
 *   3. JSON file: windows-credentials.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Get credentials
const args = {};
process.argv.slice(2).forEach(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  args[k] = v;
});

let credUrl = args.url || process.env.XTREAM_URL;
let credUser = args.user || process.env.XTREAM_USER;
let credPass = args.pass || process.env.XTREAM_PASS;

// Try loading from credentials file
if (!credUrl || !credUser || !credPass) {
  try {
    const credFile = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'windows-credentials.json'), 'utf8'));
    credUrl = credUrl || credFile.xtream_url;
    credUser = credUser || credFile.xtream_user;
    credPass = credPass || credFile.xtream_pass;
  } catch {}
}

if (!credUrl || !credUser || !credPass) {
  console.error('ERROR: No credentials found. Set XTREAM_URL, XTREAM_USER, XTREAM_PASS env vars or edit windows-credentials.json');
  process.exit(1);
}

// Remove trailing slash
const baseUrl = credUrl.replace(/\/+$/, '');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'PusztaPlayer/0.7-fetch' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 100)}`));
        } else {
          resolve(JSON.parse(data));
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log(`Fetching Xtream data from ${baseUrl}...`);

  // Fetch user info
  const authUrl = `${baseUrl}/player_api.php?username=${encodeURIComponent(credUser)}&password=${encodeURIComponent(credPass)}`;
  const authData = await httpGet(authUrl);
  if (!authData?.user_info) throw new Error('Invalid server response');
  console.log('User info:', authData.user_info.username, '| Auth:', authData.user_info.auth);

  // Fetch categories and streams in parallel
  const [liveCats, vodCats, seriesCats, liveStreams, vodStreams, seriesList] = await Promise.all([
    httpGet(`${authUrl}&action=get_live_categories`),
    httpGet(`${authUrl}&action=get_vod_categories`),
    httpGet(`${authUrl}&action=get_series_categories`),
    httpGet(`${authUrl}&action=get_live_streams`),
    httpGet(`${authUrl}&action=get_vod_streams`),
    httpGet(`${authUrl}&action=get_series`),
  ]);

  // Build output
  const output = {
    _fetchedAt: new Date().toISOString(),
    userInfo: authData.user_info,
    liveCategories: Array.isArray(liveCats) ? liveCats : [],
    vodCategories: Array.isArray(vodCats) ? vodCats : [],
    seriesCategories: Array.isArray(seriesCats) ? seriesCats : [],
    liveStreams: Array.isArray(liveStreams) ? liveStreams : [],
    vodStreams: Array.isArray(vodStreams) ? vodStreams : [],
    seriesList: Array.isArray(seriesList) ? seriesList : [],
  };

  // Write output
  const outPath = path.join(__dirname, '..', 'src', 'data', 'xtream-data.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Saved to ${outPath}`);
  console.log(`Live: ${output.liveStreams.length} | VOD: ${output.vodStreams.length} | Series: ${output.seriesList.length}`);
}

main().catch(e => {
  console.error('FETCH ERROR:', e.message);
  process.exit(1);
});
