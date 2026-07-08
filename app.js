const app = document.getElementById("app");
const navLinks = document.getElementById("navLinks");
const toastEl = document.getElementById("toast");

const PAGE_SIZE = 12;
const PARTICIPANTS = { avia: "Avia", chen: "Chen" };
const tips = [
  "Now Spinning... save the best for last.",
  "Now Spinning... every ranking becomes a little memory.",
  "Now Spinning... music first, numbers second.",
  "Now Spinning... good taste deserves autosave."
];

let supabaseClient = null;
let state = {
  role: "avia",
  route: "dashboard",
  params: {},
  rankings: [],
  songs: [],
  ratings: [],
  progress: []
};

function initSupabase() {
  if (!window.CA_CONFIG || window.CA_CONFIG.SUPABASE_URL.includes("PASTE_")) {
    return null;
  }
  return window.supabase.createClient(
    window.CA_CONFIG.SUPABASE_URL,
    window.CA_CONFIG.SUPABASE_ANON_KEY
  );
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[s]));
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean);
  const role = parts[0] === "chen" ? "chen" : "avia";
  const route = parts[1] || "dashboard";
  const id = parts[2] || null;
  state.role = role;
  state.route = route;
  state.params = { id };
}

function go(path) {
  location.hash = path;
}

function greeting(role) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return `Good ${part}, ${PARTICIPANTS[role]}`;
}

function statusLabel(status) {
  return {
    draft: "Draft",
    in_progress: "In Progress",
    ready_to_reveal: "Ready to Reveal",
    revealed: "Revealed"
  }[status] || status;
}

function statusBadge(status) {
  return `<span class="status ${status}">${statusLabel(status)}</span>`;
}

function renderShell(title, support, content) {
  app.innerHTML = `
    <h1 class="page-title">${title}</h1>
    ${support ? `<p class="supporting">${support}</p>` : ""}
    ${content}
  `;
  renderNav();
}

function renderNav() {
  navLinks.innerHTML = state.role === "avia"
    ? `
      <button onclick="go('/avia/dashboard')">Dashboard</button>
      <button onclick="go('/avia/collection')">Ranking Collection</button>
      <button onclick="go('/avia/create')">Create Ranking</button>
      <button onclick="go('/chen/dashboard')">Chen View</button>
    `
    : `
      <button onclick="go('/chen/dashboard')">Dashboard</button>
      <button onclick="go('/chen/collection')">Ranking Collection</button>
      <button onclick="go('/avia/dashboard')">Avia View</button>
    `;
}

function renderMissingConfig() {
  renderShell("C<span class='amp'>&amp;</span>A Rankings", "Configuration needed before this site can connect to Supabase.", `
    <section class="card">
      <h2>Almost ready</h2>
      <p>Open <strong>config.js</strong> and paste your Supabase URL and anon public key.</p>
      <p class="helper">After that, refresh this page.</p>
    </section>
  `);
}

async function loadAll() {
  if (!supabaseClient) return;
  const [rankings, songs, ratings, progress] = await Promise.all([
    supabaseClient.from("rankings").select("*").order("created_at", { ascending: false }),
    supabaseClient.from("songs").select("*").order("import_order", { ascending: true }),
    supabaseClient.from("ratings").select("*"),
    supabaseClient.from("progress").select("*")
  ]);
  for (const res of [rankings, songs, ratings, progress]) {
    if (res.error) throw res.error;
  }
  state.rankings = rankings.data || [];
  state.songs = songs.data || [];
  state.ratings = ratings.data || [];
  state.progress = progress.data || [];
}

function songsFor(rankingId) {
  return state.songs.filter(s => s.ranking_id === rankingId).sort((a,b) => a.import_order - b.import_order);
}

function ratingsFor(rankingId, participant) {
  return state.ratings.filter(r => r.ranking_id === rankingId && (!participant || r.participant === participant));
}

function progressFor(rankingId, participant) {
  return state.progress.find(p => p.ranking_id === rankingId && p.participant === participant);
}

function ratingCount(rankingId, participant) {
  const unique = new Set(ratingsFor(rankingId, participant).map(r => r.song_id));
  return unique.size;
}

function isParticipantFinished(rankingId, participant) {
  return !!progressFor(rankingId, participant)?.finished;
}

function getNeedAttentionRankings() {
  if (state.role === "avia") {
    return state.rankings.filter(r => ["draft", "in_progress", "ready_to_reveal"].includes(r.status));
  }
  return state.rankings.filter(r => r.status === "in_progress" && !isParticipantFinished(r.id, "chen"));
}

function renderDashboard() {
  const attention = getNeedAttentionRankings();
  const tip = tips[new Date().getDay() % tips.length];
  renderShell(
    "Dashboard",
    greeting(state.role),
    `
    <section class="grid two">
      <div class="card action">
        <h2>Needs Your Attention</h2>
        <div class="list">
          ${attention.length ? attention.map(renderRankingCard).join("") : `<p class="helper">Nothing needs your attention right now.</p>`}
        </div>
      </div>
      <div class="card tip-card">
        <h2>${tip}</h2>
        <p>Your rankings are saved as permanent snapshots once revealed.</p>
      </div>
    </section>
    `
  );
}

function renderRankingCard(r) {
  const count = songsFor(r.id).length;
  const aviaRated = ratingCount(r.id, "avia");
  const chenRated = ratingCount(r.id, "chen");
  const target = state.role === "chen" ? "chen" : "avia";
  let action = "";
  if (state.role === "avia" && r.status === "draft") {
    action = `<button class="btn primary" onclick="go('/avia/review/${r.id}')">Review & Publish</button>`;
  } else if (r.status === "in_progress") {
    action = `<button class="btn primary" onclick="go('/${target}/rate/${r.id}')">Continue Rating</button>`;
  } else if (state.role === "avia" && r.status === "ready_to_reveal") {
    action = `<button class="btn primary" onclick="go('/avia/reveal/${r.id}')">Reveal Results</button>`;
  } else if (r.status === "revealed") {
    action = `<button class="btn secondary" onclick="go('/${state.role}/results/${r.id}')">View Results</button>`;
  }
  return `
    <article class="row">
      <div class="button-row" style="justify-content:space-between">
        <strong>${escapeHtml(r.name)}</strong>
        ${statusBadge(r.status)}
      </div>
      <div class="song-meta">${count} tracks on this record · Avia ${aviaRated}/${count} · Chen ${chenRated}/${count}</div>
      <div class="button-row">${action}</div>
    </article>
  `;
}

function renderCollection() {
  const revealed = state.rankings.filter(r => r.status === "revealed");
  renderShell("Ranking Collection", "Your quiet vinyl shelf of completed rankings.", `
    <section class="card">
      ${revealed.length ? `<div class="list">${revealed.map(r => `
        <article class="row">
          <div class="button-row" style="justify-content:space-between">
            <strong>${escapeHtml(r.name)}</strong>
            ${statusBadge(r.status)}
          </div>
         <div class="song-meta">${r.type === "artist" ? "Artist Ranking" : "Mixed Playlist"} · ${new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
          <button class="btn secondary" onclick="go('/${state.role}/results/${r.id}')">Open Ranking</button>
        </article>
      `).join("")}</div>` : `
        <h2>Your collection is waiting for its first record.</h2>
        <p class="helper">Revealed rankings will appear here.</p>
      `}
    </section>
  `);
}

function renderCreate() {
  if (state.role !== "avia") return renderDashboard();
  renderShell("Create Ranking", "Start with only what matters: name, type, and songs.", `
    <section class="card">
      <form class="form" onsubmit="createRanking(event)">
        <div class="field">
          <label>Ranking Name</label>
          <input id="rankingName" required placeholder="e.g. Arctic Monkeys Birthday Ranking" />
        </div>
        <div class="field">
          <label>Ranking Type</label>
          <select id="rankingType" onchange="toggleArtistField()">
            <option value="artist">Artist Ranking</option>
            <option value="mixed">Mixed Playlist</option>
          </select>
          <p class="helper">Artist Ranking: paste song titles only. Mixed Playlist: paste Song — Artist.</p>
        </div>
        <div class="field" id="artistField">
          <label>Artist Name</label>
          <input id="artistName" placeholder="e.g. Arctic Monkeys" />
        </div>
        <div class="field">
          <label>Song List</label>
          <textarea id="songList" required placeholder="One song per line"></textarea>
          <p class="helper">For mixed playlists, use: Song Name — Artist Name. Spotify URLs can be added on the review screen.</p>
        </div>
        <button class="btn primary" type="submit">Import Songs</button>
      </form>
    </section>
  `);
}

function toggleArtistField() {
  document.getElementById("artistField").style.display = document.getElementById("rankingType").value === "artist" ? "grid" : "none";
}

function parseSongs(raw, type, artistName) {
  return raw.split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      if (type === "mixed") {
        const parts = line.split(/\s[–—-]\s/);
        return { title: parts[0]?.trim() || line, artist: parts[1]?.trim() || "", import_order: idx + 1 };
      }
      return { title: line, artist: artistName || "", import_order: idx + 1 };
    });
}
async function findSpotifyUrlForSong(song) {
  if (!window.CA_CONFIG?.SPOTIFY_SEARCH_FUNCTION_URL) return null;

  const query = `${song.title} ${song.artist || ""}`.trim();

  const response = await fetch(window.CA_CONFIG.SPOTIFY_SEARCH_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${window.CA_CONFIG.SUPABASE_ANON_KEY}`,
      "apikey": window.CA_CONFIG.SUPABASE_ANON_KEY
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) return null;

  const data = await response.json();
  return data.tracks?.[0]?.spotifyUrl || null;
}
async function createRanking(event) {
  event.preventDefault();
  const name = document.getElementById("rankingName").value.trim();
  const type = document.getElementById("rankingType").value;
  const artistName = document.getElementById("artistName").value.trim();
  const songRows = parseSongs(document.getElementById("songList").value, type, artistName);
  if (!songRows.length) return showToast("Please add at least one song.");

  const { data: ranking, error } = await supabaseClient.from("rankings").insert({
    name, type, artist_name: type === "artist" ? artistName : null, status: "draft"
  }).select().single();
  if (error) return showToast(error.message);

showToast("Finding Spotify tracks...");

const songsWithSpotify = await Promise.all(
  songRows.map(async (s) => ({
    ...s,
    ranking_id: ranking.id,
    spotify_url: await findSpotifyUrlForSong(s)
  }))
);

const { error: songsError } = await supabaseClient
  .from("songs")
  .insert(songsWithSpotify);
  if (songsError) return showToast(songsError.message);

  showToast("Tracks imported");
  await loadAll();
  go(`/avia/review/${ranking.id}`);
}

function duplicateWarnings(songList) {
  const seen = new Map();
  const dups = [];
  songList.forEach(song => {
    const key = `${song.title}`.toLowerCase().trim();
    if (seen.has(key)) dups.push(song.title);
    else seen.set(key, true);
  });
  return [...new Set(dups)];
}

function renderReview() {
  const r = state.rankings.find(x => x.id === state.params.id);
  if (!r) return renderDashboard();
  const list = songsFor(r.id);
  const dups = duplicateWarnings(list);
  renderShell("Review Songs", `${list.length} tracks on this record${dups.length ? ` · ${dups.length} possible duplicates need your attention` : ""}.`, `
    <section class="card">
      ${dups.length ? `<div class="row"><strong>Potential duplicates</strong><p class="helper">${dups.map(escapeHtml).join(", ")}</p></div>` : `<p class="helper">All imported songs are ready. You can add Spotify track URLs now or later.</p>`}
      <div class="list">
        ${list.map(s => `
          <article class="row song-row">
            <div>
              <strong>${escapeHtml(s.title)}</strong>
              <div class="song-meta">${escapeHtml(s.artist || "")}</div>
            </div>
${s.spotify_url
  ? `
    <div class="button-row">
      <a class="btn secondary" href="${escapeHtml(s.spotify_url)}" target="_blank" rel="noopener">
        Open Spotify
      </a>
      <button class="btn secondary" onclick="openSpotifyLinkDialog('${s.id}')">
        Change Link
      </button>
    </div>
  `
  : `
      <button class="btn secondary" onclick="openSpotifyLinkDialog('${s.id}')">
        Add Spotify Link
      </button>
    `
}
          </article>
        `).join("")}
      </div>
      <div class="button-row" style="margin-top:18px">
        <button class="btn primary" onclick="publishRanking('${r.id}')">Publish Ranking</button>
        <button class="btn secondary" onclick="go('/avia/dashboard')">Back</button>
      </div>
    </section>
  `);
}

async function updateSongSpotify(songId, url) {
  const cleanUrl = url.trim();

  const { error } = await supabaseClient
    .from("songs")
    .update({ spotify_url: cleanUrl })
    .eq("id", songId);

  if (error) return showToast(error.message);

  const song = state.songs.find(s => s.id === songId);
  if (song) song.spotify_url = cleanUrl;

  showToast("Spotify track linked");
  render();
}

async function publishRanking(id) {
  const { error } = await supabaseClient.from("rankings").update({ status: "in_progress", published_at: new Date().toISOString() }).eq("id", id);
  if (error) return showToast(error.message);
  showToast("Ranking published");
  await loadAll();
  go(`/avia/rate/${id}`);
}
function openSpotifyLinkDialog(songId) {
  const existing = document.getElementById("spotifyLinkDialog");
  if (existing) existing.remove();

  document.getElementById("app").insertAdjacentHTML("beforeend", `
    <div id="spotifyLinkDialog" class="dialog-backdrop">
      <div class="dialog-card">
        <h2>Find Spotify Track</h2>
        <p>Search Spotify or paste the track URL manually.</p>

        <input id="spotifySearchInput" placeholder="Song name and artist" />

        <div class="button-row">
          <button class="btn primary" onclick="searchSpotifyTracks('${songId}')">Search</button>
          <button class="btn secondary" onclick="document.getElementById('spotifyManualBox').style.display='block'">Paste URL</button>
        </div>

        <div id="spotifySearchResults"></div>

        <div id="spotifyManualBox" style="display:none; margin-top:16px;">
          <input id="spotifyLinkInput" placeholder="Spotify track URL" />
          <div class="button-row">
            <button class="btn primary" onclick="saveSpotifyLink('${songId}')">Save</button>
          </div>
        </div>

        <div class="button-row">
          <button class="btn secondary" onclick="document.getElementById('spotifyLinkDialog').remove()">Cancel</button>
        </div>
      </div>
    </div>
  `);
}

async function searchSpotifyTracks(songId) {
  const input = document.getElementById("spotifySearchInput");
  const resultsBox = document.getElementById("spotifySearchResults");
  const query = input.value.trim();

  if (!query) {
    showToast("Type a song name first");
    return;
  }

  resultsBox.innerHTML = "<p>Searching Spotify...</p>";

  const response = await fetch(window.CA_CONFIG.SPOTIFY_SEARCH_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${window.CA_CONFIG.SUPABASE_ANON_KEY}`,
      "apikey": window.CA_CONFIG.SUPABASE_ANON_KEY
    },
    body: JSON.stringify({ query })
  });

  const data = await response.json();

  if (!response.ok) {
    resultsBox.innerHTML = "<p>Spotify search failed.</p>";
    return;
  }

  if (!data.tracks || data.tracks.length === 0) {
    resultsBox.innerHTML = "<p>No tracks found.</p>";
    return;
  }

  resultsBox.innerHTML = data.tracks.map(track => `
    <div class="song-row" style="margin-top:12px;">
      <div>
        <strong>${track.name}</strong><br />
        <span>${track.artist}</span>
      </div>
      <button class="btn secondary" onclick="selectSpotifyTrack('${songId}', '${track.spotifyUrl}')">Use Track</button>
    </div>
  `).join("");
}

async function selectSpotifyTrack(songId, url) {
  await updateSongSpotify(songId, url);
  document.getElementById("spotifyLinkDialog").remove();
}

async function saveSpotifyLink(songId) {
  const input = document.getElementById("spotifyLinkInput");
  await updateSongSpotify(songId, input.value);
  document.getElementById("spotifyLinkDialog").remove();
}
function renderRate() {
  const r = state.rankings.find(x => x.id === state.params.id);
  if (!r) return renderDashboard();
  if (r.status === "draft" && state.role === "chen") return renderDashboard();
  if (r.status === "revealed") return go(`/${state.role}/results/${r.id}`);

  const list = songsFor(r.id);
  const ratings = ratingsFor(r.id, state.role);
  const scoreBySong = Object.fromEntries(ratings.map(x => [x.song_id, x.score]));
  const prog = progressFor(r.id, state.role);
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.min(Math.max(Number(new URLSearchParams(location.hash.split("?")[1] || "").get("page") || prog?.current_page || 1), 1), pageCount);
  const start = (page - 1) * PAGE_SIZE;
  const pageSongs = list.slice(start, start + PAGE_SIZE);
  const rated = ratingCount(r.id, state.role);
  const deg = list.length ? Math.round((rated / list.length) * 360) : 0;
  const firstUnratedIndex = pageSongs.findIndex(s => !scoreBySong[s.id]);

  renderShell("Rate Tracks", `${r.name} · Page ${page} of ${pageCount}`, `
    <section class="card">
      <div class="button-row">
        <span class="progress-vinyl" style="--progress:${deg}deg"></span>
        <strong>${rated} of ${list.length} tracks rated</strong>
      </div>
      <div class="pagination">
     ${Array.from({length: pageCount}, (_, i) => `<button class="${i + 1 === page ? "active" : ""}" onclick="setRatingPage('${r.id}', ${i + 1})">${pageCount - i}</button>`).join("")}
      </div>
      <div class="list">
        ${pageSongs.map((s, i) => `
          ${i === firstUnratedIndex ? `<div class="continue-marker">Continue here</div>` : ""}
          <article class="row song-row ${scoreBySong[s.id] ? "rated" : ""}">
            <div>
              ${s.spotify_url ? `<a class="song-title" href="${escapeHtml(s.spotify_url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a>` : `<span class="song-title">${escapeHtml(s.title)}</span>`}
              <div class="song-meta">${escapeHtml(s.artist || "")}</div>
            </div>
            <div class="rating-buttons">
              ${Array.from({length:10}, (_, n) => `<button class="${scoreBySong[s.id] === n+1 ? "selected" : ""}" onclick="saveRating('${r.id}', '${s.id}', ${n+1}, ${page})">${n+1}</button>`).join("")}
            </div>
          </article>
        `).join("")}
      </div>
      <div class="button-row" style="margin-top:18px">
        <button class="btn secondary" ${page <= 1 ? "disabled" : ""} onclick="setRatingPage('${r.id}', ${page-1})">Previous</button>
        <button class="btn secondary" ${page >= pageCount ? "disabled" : ""} onclick="setRatingPage('${r.id}', ${page+1})">Next</button>
        <button class="btn primary" onclick="finishRating('${r.id}')" ${rated < list.length ? "disabled title='Rate every song first'" : ""}>Finish Rating</button>
      </div>
      ${rated < list.length ? `<p class="helper">Finish becomes available after every song has a rating.</p>` : ""}
    </section>
  `);
}

async function setRatingPage(rankingId, page) {
  const prog = progressFor(rankingId, state.role);
  const payload = {
    ranking_id: rankingId,
    participant: state.role,
    current_page: page,
    last_opened_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (prog) await supabaseClient.from("progress").update(payload).eq("id", prog.id);
  else await supabaseClient.from("progress").insert(payload);
  await loadAll();
  go(`/${state.role}/rate/${rankingId}?page=${page}`);
}

async function saveRating(rankingId, songId, score, page) {
  const existing = state.ratings.find(r => r.song_id === songId && r.participant === state.role);
  if (existing) {
    await supabaseClient.from("ratings").update({ score, updated_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    await supabaseClient.from("ratings").insert({ ranking_id: rankingId, song_id: songId, participant: state.role, score });
  }

  const prog = progressFor(rankingId, state.role);
  const payload = {
    ranking_id: rankingId,
    participant: state.role,
    current_page: page,
    last_song_id: songId,
    last_opened_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  if (prog) await supabaseClient.from("progress").update(payload).eq("id", prog.id);
  else await supabaseClient.from("progress").insert(payload);

  await loadAll();
  showToast("Progress saved");
  renderRate();
}

async function finishRating(rankingId) {
  const list = songsFor(rankingId);
  if (ratingCount(rankingId, state.role) < list.length) return showToast("Please rate every song first.");
  const prog = progressFor(rankingId, state.role);
  const payload = { ranking_id: rankingId, participant: state.role, finished: true, updated_at: new Date().toISOString() };
  if (prog) await supabaseClient.from("progress").update(payload).eq("id", prog.id);
  else await supabaseClient.from("progress").insert(payload);

  await loadAll();
  if (isParticipantFinished(rankingId, "avia") && isParticipantFinished(rankingId, "chen")) {
    await supabaseClient.from("rankings").update({ status: "ready_to_reveal" }).eq("id", rankingId);
    await loadAll();
  }
  showToast("Rating finished");
  go(`/${state.role}/dashboard`);
}

function renderReveal() {
  const r = state.rankings.find(x => x.id === state.params.id);
  if (!r) return renderDashboard();
  renderShell("Reveal Results", "This action is irreversible. Once revealed, the ranking becomes an immutable archive.", `
    <section class="card">
      <h2>${escapeHtml(r.name)}</h2>
      <p>After reveal, Chen will be able to see this ranking in her Ranking Collection.</p>
      <div class="button-row">
       <button class="btn danger" onclick="confirmReveal('${r.id}')">Reveal Results</button>
        <button class="btn secondary" onclick="go('/avia/dashboard')">Cancel</button>
      </div>
    </section>
  `);
}
function confirmReveal(id) {
  const existing = document.getElementById("confirmRevealDialog");
  if (existing) existing.remove();

  document.getElementById("app").insertAdjacentHTML("beforeend", ` 
    <div id="confirmRevealDialog" class="dialog-backdrop">
      <div class="dialog-card">
        <h2>Reveal Results?</h2>
        <p>This action is irreversible. Once revealed, this ranking will become a permanent archive.</p>
        <div class="button-row">
          <button class="btn danger" onclick="revealRanking('${id}'); document.getElementById('confirmRevealDialog').remove();">
            Reveal Results
          </button>
          <button class="btn secondary" onclick="document.getElementById('confirmRevealDialog').remove();">
            Cancel
          </button>
        </div>
      </div>
    </div>
  `);
}
async function revealRanking(id) {
  const { error } = await supabaseClient.from("rankings").update({ status: "revealed", revealed_at: new Date().toISOString() }).eq("id", id);
  if (error) return showToast(error.message);
  await loadAll();
  showToast("Results revealed");
  go(`/avia/results/${id}`);
}

function calculateResults(rankingId) {
  return songsFor(rankingId).map(song => {
    const avia = state.ratings.find(r => r.song_id === song.id && r.participant === "avia")?.score ?? null;
    const chen = state.ratings.find(r => r.song_id === song.id && r.participant === "chen")?.score ?? null;
    const average = avia && chen ? (avia + chen) / 2 : null;
    return { ...song, avia, chen, average };
  }).filter(x => x.average !== null).sort((a,b) => a.average - b.average || a.import_order - b.import_order);
}

function renderResults() {
  const r = state.rankings.find(x => x.id === state.params.id);
  if (!r) return renderDashboard();
  if (r.status !== "revealed" && state.role === "chen") {
    renderShell("Sit tight...", "The reveal is coming soon.", `<section class="card"><p>Once Avia reveals the results, this ranking will appear in your Ranking Collection.</p></section>`);
    return;
  }
  const rows = calculateResults(r.id);
  renderShell("Results", "Save the best for last.", `
    <section class="card">
    ${r.spotify_playlist_url ? `<button class="btn primary" onclick="window.open('${escapeHtml(r.spotify_playlist_url)}', '_blank')">Open Spotify Playlist</button>` : ""}
      <div class="list">
        ${rows.map((s, i) => `
          <article class="row song-row">
            <div>
              ${s.spotify_url ? `<a class="song-title" href="${escapeHtml(s.spotify_url)}" target="_blank" rel="noopener">${rows.length - i}. ${escapeHtml(s.title)}</a>` : `<span class="song-title">${rows.length - i}. ${escapeHtml(s.title)}</span>`}
              <div class="song-meta">${escapeHtml(s.artist || "")}</div>
            </div>
            <strong>${s.average.toFixed(2)}</strong>
          </article>
        `).join("")}
      </div>
    </section>
  `);
}

async function router() {
  parseHash();
  supabaseClient = initSupabase();
  if (!supabaseClient) return renderMissingConfig();

  app.innerHTML = `<div class="loading"><span class="spin"></span><span>Finding tracks...</span></div>`;
  try {
    await loadAll();
  } catch (err) {
    renderShell("Something needs fixing", "Supabase returned an error.", `<section class="card"><pre>${escapeHtml(err.message)}</pre></section>`);
    return;
  }

  if (state.route === "dashboard") return renderDashboard();
  if (state.route === "collection") return renderCollection();
  if (state.route === "create") return renderCreate();
  if (state.route === "review") return renderReview();
  if (state.route === "rate") return renderRate();
  if (state.route === "reveal") return renderReveal();
  if (state.route === "results") return renderResults();
  return renderDashboard();
}

window.addEventListener("hashchange", router);
if (!location.hash) location.hash = "/avia/dashboard";
else router();
