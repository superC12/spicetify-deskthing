// NAME: DeskThing Bridge
// VERSION: 0.2.2
// DESCRIPTION: Sends what Spotify is playing (with lyrics, queue and playlists) to the Spicetify app on a DeskThing / Car Thing, and takes its commands.

(function deskthingBridge() {
	if (!window.Spicetify?.Player?.data && !window.Spicetify?.Player?.addEventListener) {
		setTimeout(deskthingBridge, 300);
		return;
	}
	if (!Spicetify.Platform || !Spicetify.CosmosAsync) {
		setTimeout(deskthingBridge, 300);
		return;
	}

	const URL_WS = "ws://127.0.0.1:8892";
	const TAG = "[DeskThing Bridge]";

	// ------------------------------------------------------------- connection

	let socket = null;
	let retry = 1000;
	function connect() {
		try {
			socket = new WebSocket(URL_WS);
		} catch {
			return scheduleReconnect();
		}
		socket.onopen = () => {
			retry = 1000;
			send("hello", { spotify: Spicetify.Platform.version ?? null });
			lastState = "";
			pushState(true);
			pushLyrics();
			pushQueue();
			pushLibrary();
		};
		socket.onmessage = (event) => {
			let msg;
			try {
				msg = JSON.parse(event.data);
			} catch {
				return;
			}
			if (msg?.type === "command")
				runCommand(msg.payload ?? {}).then(
					() => send("log", { cmd: msg.payload?.cmd, ok: true }),
					(e) => {
						console.warn(TAG, "command failed", msg.payload, e);
						send("log", { cmd: msg.payload?.cmd, ok: false, error: String(e?.message ?? e) });
					}
				);
			else if (msg?.type === "refresh") {
				lastState = "";
				pushState(true);
				pushLyrics();
				pushQueue();
				pushLibrary();
			}
		};
		socket.onclose = () => scheduleReconnect();
		socket.onerror = () => {};
	}
	function scheduleReconnect() {
		socket = null;
		setTimeout(connect, retry);
		retry = Math.min(retry * 2, 15000);
	}
	const isOpen = () => socket?.readyState === WebSocket.OPEN;
	function send(type, payload) {
		if (isOpen()) socket.send(JSON.stringify({ type, payload }));
	}

	// ------------------------------------------------------------------ state

	const imageUrl = (raw) => {
		if (!raw) return null;
		const m = String(raw).match(/^spotify:image:([a-f0-9]+)$/i);
		return m ? `https://i.scdn.co/image/${m[1]}` : raw;
	};
	const shared = () => window.LyricsPlusShared ?? null;

	function shuffleMode() {
		const s = shared();
		if (s?.shuffleMode) return s.shuffleMode(); // 0 off, 1 on, 2 smart
		const d = Spicetify.Player.data;
		if (!Spicetify.Player.getShuffle?.()) return 0;
		return d?.smartShuffle || d?.context?.metadata?.enhanced_context === "true" ? 2 : 1;
	}

	function currentState() {
		const d = Spicetify.Player.data ?? {};
		const item = d.item ?? d.track ?? {};
		const meta = item.metadata ?? {};
		const repeat = Spicetify.Player.getRepeat?.() ?? 0;
		return {
			uri: item.uri ?? null,
			title: item.name ?? meta.title ?? "",
			artists: (item.artists?.map((a) => a.name) ?? [meta.artist_name]).filter(Boolean),
			album: item.album?.name ?? meta.album_title ?? null,
			image: imageUrl(item.images?.[0]?.url ?? meta.image_xlarge_url ?? meta.image_large_url ?? meta.image_url),
			duration: Spicetify.Player.getDuration?.() ?? Number(meta.duration) ?? 0,
			progress: Spicetify.Player.getProgress?.() ?? 0,
			playing: Spicetify.Player.isPlaying?.() ?? false,
			shuffle: shuffleMode(),
			repeat: repeat === 2 ? "track" : repeat === 1 ? "all" : "off",
			liked: !!Spicetify.Player.getHeart?.(),
			volume: Spicetify.Player.getVolume?.() ?? 0,
			muted: !!Spicetify.Player.getMute?.(),
			context: { uri: d.context?.uri ?? d.context_uri ?? null, name: d.context?.metadata?.context_description ?? meta.context_description ?? null },
			at: Date.now(),
		};
	}

	// Send whenever anything other than the progress changes, and every few seconds so the device's clock stays in step
	let lastState = "";
	let lastSent = 0;
	function pushState(force = false) {
		if (!isOpen()) return;
		const state = currentState();
		const key = JSON.stringify({ ...state, progress: 0, at: 0 });
		if (!force && key === lastState && Date.now() - lastSent < 5000) return;
		lastState = key;
		lastSent = Date.now();
		send("state", state);
	}

	// ----------------------------------------------------------------- lyrics

	let lyricsFor = null;
	async function fetchLyrics(uri, meta) {
		const s = shared();
		if (s?.fetchFromSpotify) {
			try {
				const lines = await s.fetchFromSpotify(uri);
				if (lines?.length) return lines;
			} catch {}
			try {
				return await s.fetchFromLrclib(meta);
			} catch {
				return null;
			}
		}
		try {
			const id = uri.split(":")[2];
			const res = await Spicetify.CosmosAsync.get(`https://spclient.wg.spotify.com/color-lyrics/v2/track/${id}?format=json&vocalRemoval=false&market=from_token`);
			const l = res?.lyrics;
			if (!l?.lines?.length) return null;
			const synced = l.syncType === "LINE_SYNCED";
			return l.lines.map((line) => ({ text: line.words, startTime: synced ? Number(line.startTimeMs) : null }));
		} catch {
			return null;
		}
	}

	const NON_LATIN = /[぀-ヿ一-鿿가-힯]/;
	async function pushLyrics() {
		const d = Spicetify.Player.data ?? {};
		const item = d.item ?? d.track;
		const uri = item?.uri;
		if (!uri || !isOpen()) return;
		lyricsFor = uri;
		send("lyrics", { uri, status: "loading", lines: [] });
		// Neither step may hang the screen on "Loading lyrics…": lyrics get 10 s, romanization 20 s (its dictionary
		// downloads the first time). The lyrics go out as soon as they arrive; the romanized lines follow when ready.
		let lines = [];
		try {
			lines = (await withTimeout(fetchLyrics(uri, item.metadata ?? {}), 10000)) ?? [];
		} catch (e) {
			console.warn(TAG, "lyrics failed or timed out", e);
		}
		if (lyricsFor !== uri) return;
		const message = (romanized) => ({
			uri,
			status: lines.length ? "ok" : "none",
			synced: lines.some((l) => l.startTime != null),
			lines: lines.map((l, i) => ({ text: l.text ?? "", roman: romanized?.[i] && romanized[i] !== l.text ? romanized[i] : null, time: l.startTime ?? null })),
		});
		send("lyrics", message(null));
		const texts = lines.map((l) => l.text ?? "");
		if (!NON_LATIN.test(texts.join("")) || !shared()?.romanizeLines) return;
		try {
			const romanized = await withTimeout(shared().romanizeLines(texts), 20000);
			if (lyricsFor === uri) send("lyrics", message(romanized));
		} catch (e) {
			console.warn(TAG, "romanization failed or timed out", e);
		}
	}

	function withTimeout(promise, ms) {
		let timer;
		return Promise.race([promise, new Promise((_, reject) => (timer = setTimeout(() => reject(new Error("timed out")), ms)))]).finally(() => clearTimeout(timer));
	}

	// ------------------------------------------------------------ queue, library

	function trackSummary(t) {
		const ct = t?.contextTrack ?? t ?? {};
		const meta = ct.metadata ?? {};
		return {
			uri: ct.uri ?? null,
			uid: ct.uid ?? t?.uid ?? null,
			title: meta.title ?? ct.name ?? "",
			artist: meta.artist_name ?? "",
			image: imageUrl(meta.image_url ?? meta.image_small_url),
			provider: t?.provider ?? null,
		};
	}
	let lastQueue = "";
	function pushQueue() {
		const q = Spicetify.Queue;
		if (!q || !isOpen()) return;
		const next = (q.nextTracks ?? [])
			.map(trackSummary)
			.filter((t) => t.uri && !String(t.uri).startsWith("spotify:delimiter") && t.title)
			.slice(0, 50);
		const key = JSON.stringify(next.map((t) => t.uid ?? t.uri));
		if (key === lastQueue) return;
		lastQueue = key;
		send("queue", { next });
	}

	async function pushLibrary() {
		const api = Spicetify.Platform.RootlistAPI;
		if (!api?.getContents || !isOpen()) return;
		try {
			const root = await api.getContents({ limit: 500 });
			const out = [];
			const walk = (items) => {
				for (const it of items ?? []) {
					if (it.type === "folder") walk(it.items);
					else if (it.type === "playlist" && it.uri) out.push({ uri: it.uri, name: it.name, image: imageUrl(it.images?.[0]?.url), owner: it.owner?.name ?? null });
				}
			};
			walk(root?.items);
			send("library", { playlists: out.slice(0, 200) });
		} catch (e) {
			console.warn(TAG, "library failed", e);
		}
	}

	// --------------------------------------------------------------- commands

	async function runCommand(c) {
		const P = Spicetify.Player;
		switch (c.cmd) {
			case "play":
				if (!P.isPlaying()) P.play();
				break;
			case "pause":
				if (P.isPlaying()) P.pause();
				break;
			case "toggle":
				P.togglePlay();
				break;
			case "next":
				P.next();
				break;
			case "previous":
				P.back();
				break;
			case "seek":
				P.seek(Math.max(0, Number(c.ms) || 0));
				break;
			case "skipBy":
				P.seek(Math.max(0, P.getProgress() + (Number(c.ms) || 0)));
				break;
			case "volume": {
				// Spotify's own volume control first; Spicetify's helper as a fallback
				const v = Math.min(1, Math.max(0, Number(c.value)));
				const api = Spicetify.Platform.PlaybackAPI;
				if (api?.setVolume) await api.setVolume(v);
				else P.setVolume(v);
				break;
			}
			case "mute":
				P.setMute ? P.setMute(!P.getMute()) : P.toggleMute();
				break;
			case "like":
				if (c.value === undefined || !!c.value !== !!P.getHeart()) P.toggleHeart();
				break;
			case "shuffle":
				if (c.value === undefined) {
					if (shared()?.cycleShuffle) await shared().cycleShuffle();
					else P.toggleShuffle();
				} else P.setShuffle(!!c.value);
				break;
			case "repeat": {
				const map = { off: 0, all: 1, track: 2 };
				P.setRepeat(c.value in map ? map[c.value] : (P.getRepeat() + 1) % 3);
				break;
			}
			case "playUri":
				if (c.uri) await P.playUri(c.uri);
				break;
			case "skipTo":
				try {
					await Spicetify.Platform.PlayerAPI.skipTo({ uri: c.uri, uid: c.uid });
				} catch {
					if (c.uri) await P.playUri(c.uri);
				}
				break;
			case "miniPlayer":
				window.dispatchEvent(new CustomEvent("lyrics-plus-mini", { detail: "toggle" }));
				break;
			case "fullScreen":
				window.dispatchEvent(new CustomEvent("lyrics-plus-mini", { detail: "fullscreen" }));
				break;
			case "lyricsPage":
				Spicetify.Platform.History.push("/lyrics-plus");
				break;
		}
		setTimeout(() => pushState(true), 250);
	}

	// ----------------------------------------------------------------- events

	P_listen();
	function P_listen() {
		Spicetify.Player.addEventListener("songchange", () => {
			pushState(true);
			pushLyrics();
			setTimeout(pushQueue, 500);
		});
		Spicetify.Player.addEventListener("onplaypause", () => pushState(true));
		setInterval(() => pushState(), 1000);
		setInterval(pushQueue, 3000);
		setInterval(pushLibrary, 5 * 60 * 1000);
	}

	connect();
})();
