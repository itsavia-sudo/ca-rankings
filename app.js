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
  progress: [],
  tieBreaks: [],
  tieBreakEntries: []
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
    <div class="decor-art decor-sax"></div>
    <div class="decor-art decor-record"></div>
    <div class="decor-art decor-piano"></div>
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

  const [
    rankings,
    songs,
    ratings,
    progress,
    tieBreaks,
    tieBreakEntries
  ] = await Promise.all([
    supabaseClient
      .from("rankings")
      .select("*")
      .order("created_at", { ascending: false }),

    supabaseClient
      .from("songs")
      .select("*")
      .order("import_order", { ascending: true }),

    supabaseClient
      .from("ratings")
      .select("*"),

    supabaseClient
      .from("progress")
      .select("*"),

    supabaseClient
      .from("tie_breaks")
      .select("*"),

    supabaseClient
      .from("tie_break_entries")
      .select("*")
  ]);

  for (const res of [
    rankings,
    songs,
    ratings,
    progress,
    tieBreaks,
    tieBreakEntries
  ]) {
    if (res.error) throw res.error;
  }

  state.rankings = rankings.data || [];
  state.songs = songs.data || [];
  state.ratings = ratings.data || [];
  state.progress = progress.data || [];
  state.tieBreaks = tieBreaks.data || [];
  state.tieBreakEntries = tieBreakEntries.data || [];
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

function getPendingTieBreak(rankingId, participant) {
  const unresolvedTieBreaks = state.tieBreaks.filter(
    tieBreak =>
      tieBreak.ranking_id === rankingId &&
      !tieBreak.resolved
  );

  for (const tieBreak of unresolvedTieBreaks) {
    const entries = state.tieBreakEntries.filter(
      entry =>
        entry.tie_break_id === tieBreak.id &&
        entry.participant === participant
    );

    const completed = entries.every(
      entry => entry.tie_break_order !== null
    );

    if (!completed) {
      return tieBreak;
    }
  }

  return null;
}

function getNeedAttentionRankings() {
  if (state.role === "avia") {
    return state.rankings.filter(r =>
      ["draft", "in_progress", "ready_to_reveal"].includes(r.status)
    );
  }

  return state.rankings.filter(r =>
    r.status === "in_progress" &&
    (
      !isParticipantFinished(r.id, "chen") ||
      !!getPendingTieBreak(r.id, "chen")
    )
  );
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
${attention.length ? attention.map(renderRankingCard).join("") : (state.role === "chen" ? `<p class="helper"><strong>Sit tight...</strong><br>The reveal is coming soon.</p>` : `<p class="helper">Nothing needs your attention right now.</p>`)}        </div>
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
    const pendingTieBreak = getPendingTieBreak(r.id, state.role);

    if (pendingTieBreak) {
      action = `
        <button
          class="btn primary"
          onclick="go('/${state.role}/tie-break/${r.id}')"
        >
          Resolve Tie Break
        </button>
      `;
    } else {
      const actionLabel =
        state.role === "chen" && chenRated === 0
          ? "Start Rating"
          : state.role === "avia" && aviaRated === count
            ? "Edit Scores"
            : "Continue Rating";

      action = `
        <button
          class="btn primary"
          onclick="go('/${target}/rate/${r.id}')"
        >
          ${actionLabel}
        </button>
      `;
    }
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
      ${revealed.length ? `<div class="record-shelf">${revealed.map(r => `
     <article class="record-spine" onclick="go('/${state.role}/results/${r.id}')">
  <div class="record-spine-title">
    ${escapeHtml(r.name)}
  </div>

  <div class="record-spine-date">
    ${new Date(r.created_at).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric"
    })}
  </div>

  ${statusBadge(r.status)}
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

  const draft = state.params.id
    ? state.rankings.find(r => r.id === state.params.id && r.status === "draft")
    : null;

  const existingSongs = draft ? songsFor(draft.id) : [];

  const songListValue = existingSongs.map(song => {
    if (draft.type === "mixed") {
      return `${song.title} — ${song.artist || ""}`;
    }

    return song.title;
  }).join("\n");

  renderShell(
    draft ? "Edit Ranking" : "Create Ranking",
    draft
      ? "Update the ranking details or song list before publishing."
      : "Start with only what matters: name, type, and songs.",
    `
      <section class="card">
        <form
          class="form"
          onsubmit="${draft
            ? `updateDraftRanking(event, '${draft.id}')`
            : "createRanking(event)"
          }"
        >
          <div class="field">
            <label>Ranking Name</label>
            <input
              id="rankingName"
              required
              placeholder="e.g. Arctic Monkeys Birthday Ranking"
              value="${escapeHtml(draft?.name || "")}"
            />
          </div>

          <div class="field">
            <label>Ranking Type</label>
            <select id="rankingType" onchange="toggleArtistField()">
              <option value="artist" ${draft?.type === "artist" ? "selected" : ""}>
                Artist Ranking
              </option>
              <option value="mixed" ${draft?.type === "mixed" ? "selected" : ""}>
                Mixed Playlist
              </option>
            </select>

            <p class="helper">
              Artist Ranking: paste song titles only. Mixed Playlist: paste Song — Artist.
            </p>
          </div>

          <div
            class="field"
            id="artistField"
            style="display:${draft?.type === "mixed" ? "none" : "grid"}"
          >
            <label>Artist Name</label>
            <input
              id="artistName"
              placeholder="e.g. Arctic Monkeys"
              value="${escapeHtml(draft?.artist_name || "")}"
            />
          </div>

          <div class="field">
            <label>Song List</label>
            <textarea
              id="songList"
              required
              placeholder="One song per line"
            >${escapeHtml(songListValue)}</textarea>

            <p class="helper">
              For mixed playlists, use: Song Name — Artist Name.
              Spotify URLs can be added on the review screen.
            </p>
          </div>

          <div class="button-row">
            <button class="btn primary" type="submit">
              ${draft ? "Save Changes" : "Import Songs"}
            </button>

            ${draft ? `
              <button
                class="btn secondary"
                type="button"
                onclick="go('/avia/review/${draft.id}')"
              >
                Cancel
              </button>
            ` : ""}
          </div>
        </form>
      </section>
    `
  );
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
async function updateDraftRanking(event, rankingId) {
  event.preventDefault();

  const ranking = state.rankings.find(
    r => r.id === rankingId && r.status === "draft"
  );

  if (!ranking) {
    return showToast("Draft ranking not found.");
  }

  const name = document.getElementById("rankingName").value.trim();
  const type = document.getElementById("rankingType").value;
  const artistName = document.getElementById("artistName").value.trim();

  const songRows = parseSongs(
    document.getElementById("songList").value,
    type,
    artistName
  );

  if (!songRows.length) {
    return showToast("Please add at least one song.");
  }

  const { error: rankingError } = await supabaseClient
    .from("rankings")
    .update({
      name,
      type,
      artist_name: type === "artist" ? artistName : null
    })
    .eq("id", rankingId)
    .eq("status", "draft");

  if (rankingError) {
    return showToast(rankingError.message);
  }

  const { error: deleteSongsError } = await supabaseClient
    .from("songs")
    .delete()
    .eq("ranking_id", rankingId);

  if (deleteSongsError) {
    return showToast(deleteSongsError.message);
  }

  showToast("Updating Spotify tracks...");

  const songsWithSpotify = await Promise.all(
    songRows.map(async song => ({
      ...song,
      ranking_id: rankingId,
      spotify_url: await findSpotifyUrlForSong(song)
    }))
  );

  const { error: insertSongsError } = await supabaseClient
    .from("songs")
    .insert(songsWithSpotify);

  if (insertSongsError) {
    return showToast(insertSongsError.message);
  }

  await loadAll();
  showToast("Draft updated");
  go(`/avia/review/${rankingId}`);
}

async function deleteDraftRanking(rankingId) {
  const confirmed = window.confirm(
    "Delete this draft? This action cannot be undone."
  );

  if (!confirmed) return;

  const ranking = state.rankings.find(
    r => r.id === rankingId && r.status === "draft"
  );

  if (!ranking) {
    return showToast("Draft ranking not found.");
  }

  const { error: songsError } = await supabaseClient
    .from("songs")
    .delete()
    .eq("ranking_id", rankingId);
  
if (songsError) {
  console.error(songsError);
  alert(songsError.message);
  return;
}

const result = await supabaseClient
  .from("rankings")
  .delete()
  .eq("id", rankingId)
  .eq("status", "draft")
.select();

console.log("rankingId:", rankingId);
console.log(result);
console.log(state.rankings);
  
const rankingError = result.error;
if (rankingError) {
  console.error(rankingError);
  alert(rankingError.message);
  return;
}

  await loadAll();
  showToast("Draft deleted");
  go("/avia/dashboard");
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
  <button
    class="btn primary"
    onclick="publishRanking('${r.id}')"
  >
    Publish Ranking
  </button>

  <button
    class="btn secondary"
    onclick="go('/avia/create/${r.id}')"
  >
    Edit Draft
  </button>

  <button
    class="btn danger"
    onclick="deleteDraftRanking('${r.id}')"
  >
    Delete Draft
  </button>

  <button
    class="btn secondary"
    onclick="go('/avia/dashboard')"
  >
    Back to Dashboard
  </button>
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

await loadAll();
showToast("Spotify track linked");
router();
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
         <button class="btn primary" onclick="saveSpotifyLink('${songId}'); document.getElementById('spotifyLinkDialog')?.remove();">Save</button>
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
${rated > 0 && i === firstUnratedIndex ? `<div class="continue-marker">Continue here</div>` : ""}          <article class="row song-row ${scoreBySong[s.id] ? "rated" : ""}">
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

let draggedTieBreakItem = null;

function handleTieBreakDragStart(event) {
  draggedTieBreakItem = event.currentTarget;
  event.dataTransfer.effectAllowed = "move";
  event.currentTarget.classList.add("dragging");
}

function handleTieBreakDragOver(event) {
  event.preventDefault();

  const targetItem = event.currentTarget;
document
  .querySelectorAll(".tie-break-item.drag-over")
  .forEach(item => item.classList.remove("drag-over"));

targetItem.classList.add("drag-over");
  if (
    !draggedTieBreakItem ||
    draggedTieBreakItem === targetItem
  ) {
    return;
  }

  const rectangle = targetItem.getBoundingClientRect();
  const insertAfter =
    event.clientY > rectangle.top + rectangle.height / 2;

  const list = targetItem.parentElement;

  list.insertBefore(
    draggedTieBreakItem,
    insertAfter ? targetItem.nextSibling : targetItem
  );

  updateTieBreakPositions(list);
}

function updateTieBreakPositions(list) {
  const items = list.querySelectorAll(".tie-break-item");

  items.forEach((item, index) => {
    const position = item.querySelector(".tie-break-position");

    if (position) {
      position.textContent = index + 1;
    }
  });
}

function handleTieBreakDragEnd(event) {
  event.currentTarget.classList.remove("dragging");

  document
    .querySelectorAll(".tie-break-item.drag-over")
    .forEach(item => item.classList.remove("drag-over"));

  draggedTieBreakItem = null;
}

function renderTieBreak() {
  const ranking = state.rankings.find(
    item => item.id === state.params.id
  );

  if (!ranking) {
    return renderDashboard();
  }

  const tieBreak = getPendingTieBreak(
    ranking.id,
    state.role
  );

  if (!tieBreak) {
    return go(`/${state.role}/dashboard`);
  }

  const entries = state.tieBreakEntries
    .filter(entry =>
      entry.tie_break_id === tieBreak.id &&
      entry.participant === state.role
    )
    .sort((a, b) => {
      if (
        a.tie_break_order !== null &&
        b.tie_break_order !== null
      ) {
        return a.tie_break_order - b.tie_break_order;
      }

      const songA = state.songs.find(
        song => song.id === a.song_id
      );

      const songB = state.songs.find(
        song => song.id === b.song_id
      );

      return (
        (songA?.import_order || 0) -
        (songB?.import_order || 0)
      );
    });

  const tiedSongs = entries
    .map(entry =>
      state.songs.find(song => song.id === entry.song_id)
    )
    .filter(Boolean);

  renderShell(
    "Tie Break",
    `${ranking.name} · Drag the songs into your preferred order.`,
    `
      <section class="card">
        <h2>Resolve this tie</h2>

        <p class="helper">
          Place your favourite song at the top and your least favourite
          song at the bottom.
        </p>

        <div
          id="tieBreakList"
          class="list"
          data-tie-break-id="${tieBreak.id}"
        >
          ${tiedSongs.map((song, index) => `
            <article
              class="row song-row tie-break-item"
              draggable="true"
              data-song-id="${song.id}"
              ondragstart="handleTieBreakDragStart(event)"
              ondragover="handleTieBreakDragOver(event)"
              ondragend="handleTieBreakDragEnd(event)"
            >
              <div class="button-row">
                <strong class="tie-break-position">
                  ${index + 1}
                </strong>

                <div>
                  ${
                    song.spotify_url
                      ? `
                        <a
                          class="song-title"
                          href="${escapeHtml(song.spotify_url)}"
                          target="_blank"
                          rel="noopener"
                        >
                          ${escapeHtml(song.title)}
                        </a>
                      `
                      : `
                        <span class="song-title">
                          ${escapeHtml(song.title)}
                        </span>
                      `
                  }

                  <div class="song-meta">
                    ${escapeHtml(song.artist || "")}
                  </div>
                </div>
              </div>

             <span class="tie-break-handle">☰</span>
            </article>
          `).join("")}
        </div>

        <div class="button-row" style="margin-top:18px">
          <button
            class="btn primary"
            onclick="saveTieBreakOrder('${ranking.id}', '${tieBreak.id}')"
          >
            Save Order
          </button>

          <button
            class="btn secondary"
            onclick="go('/${state.role}/dashboard')"
          >
            Back
          </button>
        </div>
      </section>
    `
  );
}

async function saveTieBreakOrder(rankingId, tieBreakId) {
  const list = document.getElementById("tieBreakList");

  if (!list) {
    return showToast("Tie Break list not found.");
  }

  const items = [...list.querySelectorAll(".tie-break-item")];

  if (items.length < 2) {
    return showToast("There are not enough songs to resolve this tie.");
  }

  const updates = items.map((item, index) => ({
    songId: item.dataset.songId,
    order: index + 1
  }));

  for (const update of updates) {
    const { error } = await supabaseClient
      .from("tie_break_entries")
      .update({
        tie_break_order: update.order
      })
      .eq("tie_break_id", tieBreakId)
      .eq("song_id", update.songId)
      .eq("participant", state.role);

    if (error) {
      showToast(error.message);
      return;
    }
  }

  await loadAll();

  const tieBreakEntries = state.tieBreakEntries.filter(
    entry => entry.tie_break_id === tieBreakId
  );

  const bothParticipantsFinished = tieBreakEntries.every(
    entry => entry.tie_break_order !== null
  );

  if (bothParticipantsFinished) {
    const { error: resolveError } = await supabaseClient
      .from("tie_breaks")
      .update({
        resolved: true
      })
      .eq("id", tieBreakId);

    if (resolveError) {
      showToast(resolveError.message);
      return;
    }

    await loadAll();
  }

  const rankingTieBreaks = state.tieBreaks.filter(
    tieBreak => tieBreak.ranking_id === rankingId
  );

  const allTieBreaksResolved =
    rankingTieBreaks.length > 0 &&
    rankingTieBreaks.every(tieBreak => tieBreak.resolved);

  if (allTieBreaksResolved) {
    const { error: rankingError } = await supabaseClient
      .from("rankings")
      .update({
        status: "ready_to_reveal"
      })
      .eq("id", rankingId);

    if (rankingError) {
      showToast(rankingError.message);
      return;
    }

    await loadAll();
  }

  showToast("Tie Break order saved");

  const nextTieBreak = getPendingTieBreak(
    rankingId,
    state.role
  );

  if (nextTieBreak) {
    renderTieBreak();
    return;
  }

  go(`/${state.role}/dashboard`);
}

async function createTieBreaksIfNeeded(rankingId) {
  const existingTieBreaks = state.tieBreaks.filter(
    tieBreak => tieBreak.ranking_id === rankingId
  );

  if (existingTieBreaks.length > 0) {
    return existingTieBreaks.filter(tieBreak => !tieBreak.resolved).length;
  }

  const results = songsFor(rankingId).map(song => {
    const aviaScore = state.ratings.find(
      rating =>
        rating.song_id === song.id &&
        rating.participant === "avia"
    )?.score;

    const chenScore = state.ratings.find(
      rating =>
        rating.song_id === song.id &&
        rating.participant === "chen"
    )?.score;

    return {
      song,
      average: (aviaScore + chenScore) / 2
    };
  });

  const groupsByAverage = new Map();

  results.forEach(result => {
    const key = result.average.toFixed(2);

    if (!groupsByAverage.has(key)) {
      groupsByAverage.set(key, []);
    }

    groupsByAverage.get(key).push(result.song);
  });

  const tiedGroups = [...groupsByAverage.entries()].filter(
    ([, songs]) => songs.length > 1
  );

  for (const [average, tiedSongs] of tiedGroups) {
    const { data: tieBreak, error: tieBreakError } = await supabaseClient
      .from("tie_breaks")
      .insert({
        ranking_id: rankingId,
        original_average: Number(average),
        resolved: false
      })
      .select()
      .single();

    if (tieBreakError) throw tieBreakError;

    const entries = tiedSongs.flatMap(song => [
      {
        tie_break_id: tieBreak.id,
        song_id: song.id,
        participant: "avia",
        tie_break_order: null
      },
      {
        tie_break_id: tieBreak.id,
        song_id: song.id,
        participant: "chen",
        tie_break_order: null
      }
    ]);

    const { error: entriesError } = await supabaseClient
      .from("tie_break_entries")
      .insert(entries);

    if (entriesError) throw entriesError;
  }

  await loadAll();
  return tiedGroups.length;
}

async function finishRating(rankingId) {
  const list = songsFor(rankingId);
  if (ratingCount(rankingId, state.role) < list.length) return showToast("Please rate every song first.");
  const prog = progressFor(rankingId, state.role);
  const payload = { ranking_id: rankingId, participant: state.role, finished: true, updated_at: new Date().toISOString() };
  if (prog) await supabaseClient.from("progress").update(payload).eq("id", prog.id);
  else await supabaseClient.from("progress").insert(payload);

  await loadAll();

  if (
    isParticipantFinished(rankingId, "avia") &&
    isParticipantFinished(rankingId, "chen")
  ) {
    try {
      const tieBreakCount = await createTieBreaksIfNeeded(rankingId);

      if (tieBreakCount === 0) {
        await supabaseClient
          .from("rankings")
          .update({ status: "ready_to_reveal" })
          .eq("id", rankingId);

        await loadAll();
      }
    } catch (error) {
      showToast(error.message);
      return;
    }
  }
go(`/${state.role}/ranking-complete`);
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
    const tieBreakEntry = state.tieBreakEntries.find(
  entry =>
    entry.song_id === song.id &&
    entry.participant === "avia"
);

return {
  ...song,
  avia,
  chen,
  average,
  tieBreakOrder: tieBreakEntry?.tie_break_order ?? null
};
 })
.filter(x => x.average !== null)
.sort((a, b) => {
  if (a.average !== b.average) {
    return a.average - b.average;
  }

  if (
    a.tieBreakOrder !== null &&
    b.tieBreakOrder !== null
  ) {
    return b.tieBreakOrder - a.tieBreakOrder;
  }

  return a.import_order - b.import_order;
});
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
<div>
  <strong>${s.average.toFixed(2)}</strong>
  ${s.tieBreakOrder !== null
    ? `<div class="song-meta">Resolved by Tie Break</div>`
    : ""}
</div>          </article>
        `).join("")}
      </div>
    </section>
  `);
}
function renderRankingComplete() {
  renderShell(
    "Ranking Complete",
    "Your scores have been saved.",
    `
      <section class="card">
        <div class="button-row">
          <button class="btn primary" onclick="go('/${state.role}/dashboard')">
            Go to Dashboard
          </button>
        </div>
      </section>
    `
  );
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
  if (state.route === "tie-break") return renderTieBreak();
  if (state.route === "reveal") return renderReveal();
  if (state.route === "results") return renderResults();
  if (state.route === "ranking-complete") return renderRankingComplete();
  return renderDashboard();
}

window.addEventListener("hashchange", router);
if (!location.hash) location.hash = "/avia/dashboard";
else router();
