import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp, ArrowUpRight, BadgeCheck, BellRing, CalendarDays, Check, ChevronDown,
  CircleHelp, Compass, ExternalLink, Filter, Heart, LocateFixed, MapPin, MapPinned,
  Navigation, Search, Send, Sparkles, X, ZoomIn
} from 'lucide-react';
import PandalMap, { directionsUrl } from './components/PandalMap.jsx';

const formatDistance = (value) => {
  if (!Number.isFinite(value) || value < 0) return '—';
  return value < 1 ? `${Math.round(value * 1000)} m` : `${value.toFixed(1)} km`;
};
const isCoordinate = (lat, lng) => Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Number(lat) >= -90 && Number(lat) <= 90 && Number(lng) >= -180 && Number(lng) <= 180;
const distanceKm = (a, b) => {
  if (!isCoordinate(a?.lat, a?.lng) || !isCoordinate(b?.lat, b?.lng)) return Number.POSITIVE_INFINITY;
  const rad = n => n * Math.PI / 180;
  const dLat = rad(Number(b.lat) - Number(a.lat));
  const dLng = rad(Number(b.lng) - Number(a.lng));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(Number(a.lat))) * Math.cos(rad(Number(b.lat))) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
};

function App() {
  const [pandals, setPandals] = useState([]);
  const [areaCentres, setAreaCentres] = useState({});
  const [query, setQuery] = useState('');
  const [district, setDistrict] = useState('all');
  const [area, setArea] = useState('');
  const [radius, setRadius] = useState('all');
  const [showAll, setShowAll] = useState(false);
  const [userPosition, setUserPosition] = useState(null);
  const [locationStatus, setLocationStatus] = useState({ kind: 'neutral', message: 'Tap “Use live location” to allow GPS. If you have already granted permission in this browser, your location will be restored automatically.' });
  const [mapCommand, setMapCommand] = useState({ type: 'statewide', key: 0 });
  const [apiStatus, setApiStatus] = useState('loading');
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [suggestionState, setSuggestionState] = useState({ busy: false, message: '', error: false });
  const [suggestion, setSuggestion] = useState({ name: '', area: '', district: 'Kolkata', theme: '', email: '', note: '' });
  const watchIdRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      const [pandalResponse, areaResponse, healthResponse] = await Promise.all([
        fetch('/api/pandals'), fetch('/api/areas'), fetch('/api/health')
      ]);
      if (!pandalResponse.ok || !areaResponse.ok || !healthResponse.ok) throw new Error('The API did not respond correctly.');
      const [pandalJson, areaJson] = await Promise.all([pandalResponse.json(), areaResponse.json()]);
      setPandals(pandalJson.pandals || []);
      setAreaCentres(areaJson.areas || {});
      setApiStatus('online');
    } catch (error) {
      setApiStatus('offline');
      setLocationStatus({ kind: 'error', message: 'The backend API is not responding. Start the app from the project folder using npm run dev.' });
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => () => {
    if (watchIdRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
  }, []);

  const districts = useMemo(() => [...new Set(pandals.map(p => p.district).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [pandals]);
  const areas = useMemo(() => Object.keys(areaCentres), [areaCentres]);

  const allRanked = useMemo(() => {
    return pandals.map(p => ({
      ...p,
      distance: userPosition ? distanceKm(userPosition, { lat: Number(p.lat), lng: Number(p.lng) }) : null
    })).sort((a, b) => {
      if (!userPosition) {
        // Surface entries cross-referenced with published guides first; keep every other listing searchable below them.
        const sourceOrder = Number(Boolean(b.recordStatus === 'source-listed' && b.sourceUrl)) - Number(Boolean(a.recordStatus === 'source-listed' && a.sourceUrl));
        return sourceOrder || a.name.localeCompare(b.name);
      }
      const byDistance = (Number.isFinite(a.distance) ? a.distance : Infinity) - (Number.isFinite(b.distance) ? b.distance : Infinity);
      return byDistance || a.name.localeCompare(b.name);
    });
  }, [pandals, userPosition]);

  const filteredPandals = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return allRanked.filter(p => {
      const textMatch = !normalized || `${p.name} ${p.area} ${p.theme} ${p.district}`.toLowerCase().includes(normalized);
      const districtMatch = district === 'all' || p.district === district;
      const radiusMatch = radius === 'all' || !userPosition || (Number.isFinite(p.distance) && p.distance <= Number(radius));
      return textMatch && districtMatch && radiusMatch;
    });
  }, [allRanked, query, district, radius, userPosition]);

  const nearest = userPosition ? filteredPandals[0] : null;
  const shownPandals = showAll ? filteredPandals : filteredPandals.slice(0, 20);
  const approxCount = pandals.filter(p => p.locationPrecision === 'approximate').length;
  const sourceListedCount = pandals.filter(p => p.recordStatus === 'source-listed' && p.sourceUrl).length;

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
  }, []);

  const applyGpsPosition = useCallback((position) => {
    const lat = Number(position?.coords?.latitude);
    const lng = Number(position?.coords?.longitude);
    if (!isCoordinate(lat, lng)) {
      setLocationStatus({ kind: 'error', message: 'The browser returned invalid coordinates. Check device Location Services and try again.' });
      return;
    }
    const accuracy = Number(position.coords.accuracy);
    const next = { lat, lng, source: 'gps', accuracy: Number.isFinite(accuracy) ? accuracy : null, updatedAt: Date.now() };
    setUserPosition(next);
    setArea('');
    setLocationStatus({ kind: 'success', message: `Live location active${Number.isFinite(accuracy) ? ` · accuracy about ${Math.round(accuracy)} m` : ''}. Distances update as your device moves.` });
    setMapCommand({ type: 'user', lat: next.lat, lng: next.lng, zoom: 13, key: Date.now() });
  }, []);

  const explainGeoError = useCallback((error) => {
    const msg = error?.code === 1
      ? 'Location permission was denied. In Chrome, open the site controls beside the address, set Location to Allow, then retry.'
      : error?.code === 3
        ? 'GPS timed out. Check device Location Services, move near a window, or choose an area as a fallback.'
        : 'We could not get a GPS fix. Check device Location Services, then retry or choose an area.';
    setLocationStatus({ kind: 'error', message: `${msg} GPS works on localhost or an HTTPS website.` });
  }, []);

  const locateMe = useCallback(({ reveal = false, quiet = false } = {}) => {
    if (reveal) document.getElementById('explore')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!navigator.geolocation) {
      setLocationStatus({ kind: 'error', message: 'This browser does not support location. Choose an area from the selector instead.' });
      return;
    }

    stopWatching();
    setLocationStatus({ kind: 'neutral', message: quiet ? 'Restoring your previously allowed browser location…' : 'Requesting GPS permission… please allow location access in your browser.' });

    const beginWatching = () => {
      stopWatching();
      watchIdRef.current = navigator.geolocation.watchPosition(
        applyGpsPosition,
        (error) => {
          if (error?.code === 1) explainGeoError(error);
          else setLocationStatus(previous => previous.kind === 'success'
            ? { kind: 'neutral', message: 'Using your last GPS fix while waiting for the next update. Keep Location Services enabled for live movement.' }
            : previous);
        },
        { enableHighAccuracy: true, timeout: 25000, maximumAge: 5000 }
      );
    };

    const tryLowerAccuracy = (firstError) => {
      if (firstError?.code === 1) {
        explainGeoError(firstError);
        return;
      }
      setLocationStatus({ kind: 'neutral', message: 'High-accuracy GPS is taking too long. Trying a faster location fix…' });
      navigator.geolocation.getCurrentPosition(
        (position) => { applyGpsPosition(position); beginWatching(); },
        explainGeoError,
        { enableHighAccuracy: false, timeout: 18000, maximumAge: 30000 }
      );
    };

    navigator.geolocation.getCurrentPosition(
      (position) => { applyGpsPosition(position); beginWatching(); },
      tryLowerAccuracy,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, [applyGpsPosition, explainGeoError, stopWatching]);

  // If this browser has already granted location permission, restore the location automatically.
  // We do not trigger a permission prompt on first visit; the user stays in control.
  useEffect(() => {
    let cancelled = false;
    if (!navigator.permissions?.query) return undefined;
    navigator.permissions.query({ name: 'geolocation' }).then(permission => {
      if (!cancelled && permission.state === 'granted') locateMe({ quiet: true });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [locateMe]);

  const chooseArea = (value) => {
    setArea(value);
    if (!value || !areaCentres[value]) {
      setUserPosition(null);
      setRadius('all');
      setLocationStatus({ kind: 'neutral', message: 'No area selected. Tap “Use live location” or select an area to rank nearby pandals.' });
      setMapCommand({ type: 'statewide', key: Date.now() });
      return;
    }
    stopWatching();
    const [lat, lng] = areaCentres[value];
    setUserPosition({ lat, lng, source: 'area', accuracy: null });
    setLocationStatus({ kind: 'neutral', message: `Exploring from the approximate centre of ${value}. This is not live GPS.` });
    setMapCommand({ type: 'user', lat, lng, zoom: 12, key: Date.now() });
  };

  const showStatewide = ({ reveal = false } = {}) => {
    if (reveal) document.getElementById('explore')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    stopWatching();
    setUserPosition(null);
    setArea('');
    setQuery('');
    setDistrict('all');
    setRadius('all');
    setShowAll(false);
    setMapCommand({ type: 'statewide', key: Date.now() });
    setLocationStatus({ kind: 'neutral', message: 'Showing the West Bengal directory. Use GPS or choose an area to rank pandals by distance.' });
  };

  const focusPandal = (p) => setMapCommand({ type: 'pandal', lat: Number(p.lat), lng: Number(p.lng), zoom: 16, key: Date.now() });

  const openSuggestion = () => {
    setSuggestionState({ busy: false, message: '', error: false });
    setSuggestionOpen(true);
  };

  const submitSuggestion = async (event) => {
    event.preventDefault();
    setSuggestionState({ busy: true, message: '', error: false });
    try {
      const response = await fetch('/api/suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(suggestion) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not submit the suggestion.');
      setSuggestionState({ busy: false, message: data.message || 'Suggestion sent for review.', error: false });
      setSuggestion({ name: '', area: '', district: 'Kolkata', theme: '', email: '', note: '' });
    } catch (error) {
      setSuggestionState({ busy: false, message: error.message, error: true });
    }
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <nav className="nav-wrap" aria-label="Main navigation">
          <a className="brand" href="#top" aria-label="Pandal Finder home"><span className="brand-mark">🪔</span><span>Pandal<span className="brand-light">Finder</span></span></a>
          <div className="nav-links"><a href="#explore">Explore</a><a href="#nearby">Nearby pandals</a><button className="nav-suggest" onClick={openSuggestion}><MapPin size={16} /> Add a pandal</button></div>
        </nav>
        <div id="top" className="hero container">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={14} /> SHUBHO SHARODIYA · WEST BENGAL</div>
            <h1>Every pandal.<br /><span>One beautiful map.</span></h1>
            <p>Find your next Durga Puja stop, discover neighbourhood favourites, and navigate from wherever you are.</p>
            <div className="hero-buttons"><button className="button button-primary" onClick={() => locateMe({ reveal: true })}><LocateFixed size={18} /> Find pandals near me</button><button className="button button-glass" onClick={() => showStatewide({ reveal: true })}><MapPinned size={18} /> Explore West Bengal</button></div>
            <div className="hero-trust"><span><Check size={15} /> Live GPS option</span><span><Check size={15} /> Nearby sorting</span><span><Check size={15} /> Open directions</span></div>
          </div>
          <div className="hero-art" aria-hidden="true"><div className="halo halo-one"/><div className="halo halo-two"/><div className="hero-lamp">🪔</div><div className="floating-note note-top"><MapPin size={15}/><span>Find a pandal<br/><small>near your location</small></span></div><div className="floating-note note-bottom"><Navigation size={15}/><span>One tap to<br/><small>get directions</small></span></div></div>
          <div className="hero-bottom-glow"/>
        </div>
      </header>

      <main className="container main-content">
        <section className="stats-row" aria-label="Directory statistics">
          <div className="stat-item"><span className="stat-icon"><MapPinned size={20}/></span><span className="stat-value">{pandals.length || '—'}</span><span className="stat-label">Curated listings</span></div>
          <div className="stat-item"><span className="stat-icon"><MapPin size={20}/></span><span className="stat-value">{districts.length || '—'}</span><span className="stat-label">Districts represented</span></div>
          <div className="stat-item"><span className="stat-icon"><LocateFixed size={20}/></span><span className="stat-value">{userPosition?.source === 'gps' ? 'LIVE' : 'GPS'}</span><span className="stat-label">Location-aware search</span></div>
          <div className="stat-data"><span className={`api-dot ${apiStatus}`}/>{apiStatus === 'online' ? 'Directory connected' : apiStatus === 'loading' ? 'Connecting to directory…' : 'API connection needed'}</div>
        </section>

        {apiStatus === 'offline' && <div className="api-error"><CircleHelp size={20}/><div><strong>Backend not connected</strong><span>Run <code>npm run dev</code> from the extracted project folder, then refresh this page.</span></div><button className="icon-button" aria-label="Retry connection" onClick={loadData}><ArrowDownUp size={17}/></button></div>}

        <section id="explore" className="section-block">
          <div className="section-heading"><div><div className="section-kicker">DISCOVER YOUR NEXT STOP</div><h2>Explore the pandal map</h2><p>Search by pandal, locality or district. Tap any pin to see details.</p></div><div className="season-pill"><CalendarDays size={15}/> 2026 season · details unconfirmed</div></div>
          <div className="search-panel">
            <div className="search-input-wrap"><Search size={19}/><input aria-label="Search by pandal or area" type="search" placeholder="Search pandal name, area or theme…" value={query} onChange={e => { setQuery(e.target.value); setShowAll(false); }} /><kbd>⌕</kbd></div>
            <div className="select-wrap"><Filter size={17}/><select value={district} aria-label="Filter by district" onChange={e => { setDistrict(e.target.value); setShowAll(false); }}><option value="all">All districts</option>{districts.map(d => <option key={d} value={d}>{d}</option>)}</select><ChevronDown size={15}/></div>
            <div className="select-wrap"><MapPin size={17}/><select value={area} aria-label="Explore from area" onChange={e => chooseArea(e.target.value)}><option value="">Choose an area</option>{areas.map(a => <option key={a} value={a}>{a}</option>)}</select><ChevronDown size={15}/></div>
            <div className="select-wrap radius-select"><Compass size={17}/><select value={radius} aria-label="Filter by distance" disabled={!userPosition} onChange={e => { setRadius(e.target.value); setShowAll(false); }}><option value="all">All distances</option><option value="5">Within 5 km</option><option value="10">Within 10 km</option><option value="25">Within 25 km</option></select><ChevronDown size={15}/></div>
          </div>

          <div className="location-status-row"><div className={`location-status ${locationStatus.kind}`}><span className="location-pulse">●</span><span>{locationStatus.message}</span></div><button className="button button-outline locate-button" onClick={() => locateMe({ reveal: false })}><LocateFixed size={16}/> {userPosition?.source === 'gps' ? 'Refresh GPS' : 'Use live location'}</button></div>

          <div className="map-toolbar"><div className="map-title"><span className="map-title-icon"><MapPinned size={18}/></span><div><strong>West Bengal & nearby areas</strong><span>OpenStreetMap · map pins may be approximate</span></div></div><div className="map-tools"><button className="button button-soft" onClick={showStatewide}><ZoomIn size={16}/> Show state</button>{userPosition && <button className="button button-soft" onClick={() => setMapCommand({ type: 'user', lat: userPosition.lat, lng: userPosition.lng, zoom: 13, key: Date.now() })}><LocateFixed size={16}/> My location</button>}</div></div>
          <PandalMap pandals={filteredPandals} userPosition={userPosition} command={mapCommand}/>
          <div className="map-footnote"><span><span className="footnote-dot"/> {filteredPandals.length} map {filteredPandals.length === 1 ? 'pin' : 'pins'} matching your filters</span><span>Map tiles need an internet connection</span></div>
        </section>

        <section id="nearby" className="section-block nearby-section">
          <div className="section-heading list-section-heading"><div><div className="section-kicker">MAKE A DAY OF IT</div><h2>{userPosition?.source === 'gps' ? 'Nearest pandals to you' : userPosition ? 'Nearest pandals from selected area' : 'Pandal directory'}</h2><p>{userPosition?.source === 'gps' ? 'Ranked by distance from your live device location.' : userPosition ? 'Ranked from the approximate centre of your selected area.' : 'Choose GPS or an area to sort by what is closest.'}</p></div><div className="result-summary"><strong>{filteredPandals.length}</strong><span>matching listings</span></div></div>

          {nearest && <article className="nearest-card"><div className="nearest-pin"><Navigation size={20}/></div><div className="nearest-copy"><div className="nearest-label">{userPosition?.source === 'gps' ? 'YOUR CLOSEST LISTING' : 'CLOSEST LISTING FROM SELECTED AREA'}</div><h3>{nearest.name}</h3><p><MapPin size={14}/>{nearest.area} · {nearest.district}</p></div><div className="nearest-distance"><strong>{formatDistance(nearest.distance)}</strong><span>straight-line</span></div><a className="button button-primary nearest-directions" href={directionsUrl(nearest)} target="_blank" rel="noreferrer"><Navigation size={16}/> Directions <ArrowUpRight size={15}/></a></article>}

          {filteredPandals.length === 0 ? <div className="empty-state"><Search size={28}/><strong>No pandals match those filters</strong><span>Try another name, district or distance.</span><button className="button button-outline" onClick={() => { setQuery(''); setDistrict('all'); setRadius('all'); }}>Clear filters</button></div> : <>
            <div className="results-bar"><div className="results-count">Showing <strong>{shownPandals.length}</strong> of <strong>{filteredPandals.length}</strong> matching listings{userPosition && <span> · nearest first</span>}</div><button className="text-button" onClick={() => setShowAll(v => !v)}>{showAll ? 'Show nearest 20' : `Show all ${filteredPandals.length}`} <ArrowUpRight size={15}/></button></div>
            <div className="pandal-grid">{shownPandals.map((p, i) => <article key={p.id} className="pandal-card" tabIndex={0} role="button" onClick={() => focusPandal(p)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusPandal(p); } }}>
              <div className="card-number">{String(i + 1).padStart(2, '0')}</div><div className="card-main"><div className="card-title-row"><h3>{p.name}</h3>{p.recordStatus === 'source-listed' && p.sourceUrl && <span className="source-tag" title={`Name appears in ${p.sourceLabel || 'a published guide'}; this does not independently confirm the exact map pin or current opening status.`}>Source-listed</span>}{p.locationPrecision === 'approximate' && <span className="approx-tag" title="Map pin is approximate; verify before travelling">Approx. pin</span>}</div><p className="card-location"><MapPin size={13}/>{p.area}</p><div className="card-meta"><span>{p.district}</span><span className="meta-dot"/><span>{p.seasonStatus === 'confirmed' ? 'Season confirmed' : 'Verify seasonal details'}</span></div></div><div className="card-distance">{p.distance === null ? <span className="distance-dash">—</span> : <><strong>{formatDistance(p.distance)}</strong><span>away</span></>}<button aria-label={`Show ${p.name} on the map`} onClick={e => { e.stopPropagation(); focusPandal(p); }}><ArrowUpRight size={17}/></button></div>
            </article>)}</div>
            {!showAll && filteredPandals.length > 20 && <button className="button button-outline load-more" onClick={() => setShowAll(true)}>Show all {filteredPandals.length} matching pandals <ArrowUpRight size={16}/></button>}
          </>}
        </section>

        <section className="contribute-banner"><div className="contribute-icon"><BellRing size={23}/></div><div><div className="section-kicker">HELP THE COMMUNITY</div><h2>Know a pandal we missed?</h2><p>Send us a listing suggestion. It stays pending until reviewed, so unverified details don't automatically appear on the map.</p></div><button className="button button-primary" onClick={openSuggestion}><Send size={16}/> Suggest a pandal</button></section>

        <section className="data-note"><div className="data-note-icon"><CircleHelp size={19}/></div><div><strong>About this directory</strong><p>This directory currently contains {pandals.length} entries, including {sourceListedCount} names cross-referenced against published guides. A source-listed name does not guarantee exact coordinates, a current-season installation, or opening status. {approxCount} pins are marked approximate; other pins may still need confirmation. It is not a complete or officially verified registry of every pandal in West Bengal. Distances are straight-line estimates, not road distances. User location is handled in your browser and is not sent to this directory API.</p></div></section>
      </main>

      <footer className="site-footer"><div className="container footer-inner"><a className="brand footer-brand" href="#top"><span className="brand-mark">🪔</span><span>Pandal<span className="brand-light">Finder</span></span></a><span>Made for puja-hopping with care <Heart size={14} fill="currentColor"/> across West Bengal.</span><span className="footer-open">Map data © OpenStreetMap contributors</span></div></footer>

      {suggestionOpen && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !suggestionState.busy) setSuggestionOpen(false); }}><section className="suggestion-modal" role="dialog" aria-modal="true" aria-labelledby="suggestion-title"><div className="modal-head"><div className="modal-symbol"><MapPin size={20}/></div><div><div className="section-kicker">COMMUNITY CONTRIBUTION</div><h2 id="suggestion-title">Suggest a pandal</h2></div><button className="icon-button" aria-label="Close" onClick={() => setSuggestionOpen(false)}><X size={19}/></button></div>
        {suggestionState.message && <div className={`submit-message ${suggestionState.error ? 'error' : 'success'}`}>{suggestionState.error ? <CircleHelp size={17}/> : <Check size={17}/>}<span>{suggestionState.message}</span></div>}
        <form onSubmit={submitSuggestion}>
          <label>Pandal name <span>*</span><input required minLength={3} maxLength={140} value={suggestion.name} onChange={e => setSuggestion(s => ({ ...s, name: e.target.value }))} placeholder="e.g. local Sarbojanin Puja" /></label>
          <div className="form-row"><label>Area / locality <span>*</span><input required maxLength={140} value={suggestion.area} onChange={e => setSuggestion(s => ({ ...s, area: e.target.value }))} placeholder="Neighbourhood" /></label><label>District <span>*</span><select required value={suggestion.district} onChange={e => setSuggestion(s => ({ ...s, district: e.target.value }))}>{districts.map(d => <option key={d} value={d}>{d}</option>)}{!districts.includes('Other') && <option value="Other">Other</option>}</select></label></div>
          <label>Theme or identifying details<input maxLength={240} value={suggestion.theme} onChange={e => setSuggestion(s => ({ ...s, theme: e.target.value }))} placeholder="Optional" /></label>
          <label>Contact email<input type="email" maxLength={160} value={suggestion.email} onChange={e => setSuggestion(s => ({ ...s, email: e.target.value }))} placeholder="Optional — only for clarification" /></label>
          <label>Anything we should verify?<textarea maxLength={600} rows={3} value={suggestion.note} onChange={e => setSuggestion(s => ({ ...s, note: e.target.value }))} placeholder="Landmark, directions, dates, or reliable source" /></label>
          <div className="form-footnote">Suggestions are saved to the backend review queue; they do not show publicly until approved by an administrator.</div>
          <div className="modal-actions"><button type="button" className="button button-outline" onClick={() => setSuggestionOpen(false)} disabled={suggestionState.busy}>Cancel</button><button type="submit" className="button button-primary" disabled={suggestionState.busy}>{suggestionState.busy ? 'Submitting…' : 'Send suggestion'} <Send size={15}/></button></div>
        </form>
      </section></div>}
    </div>
  );
}

export default App;
