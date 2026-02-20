"use client";

import { useState, useEffect, useMemo } from 'react';

interface ScraperRun {
  id: number;
  source: string;
  status: string;
  itemsFound: number;
  itemsNew: number;
  itemsUpdated: number;
  errors: string | null;
  duration: number | null;
  startedAt: string;
  completedAt: string | null;
}

interface ScrapedListing {
  id: number;
  source: string;
  address: string;
  suite: string | null;
  propertyType: string;
  propertyTypeFlag: string | null;
  listingType: string;
  askingPrice: number | null;
  askingRent: number | null;
  rentBasis: string | null;
  squareFeet: number | null;
  broker: string | null;
  brokerageFirm: string;
  status: string;
  occupancyCost: number | null;
  dismissed: number;
  firstSeen: string;
  lastSeen: string;
  releasedTo: string | null;
  releasedAt: string | null;
}

interface MutedAddress {
  id: number;
  address: string;
  reason: string | null;
  mutedAt: string;
}

interface ReleaseResult {
  listingId: number;
  address: string;
  classification: string;
  targetTable: string;
  matchedBuilding?: string;
  inventoryMatch?: boolean;
  error?: string;
}

interface ReleaseResponse {
  results: ReleaseResult[];
  counts: { downtown: number; suburban: number; industrial: number; errors: number };
  action: string;
}

interface ListingChange {
  id: number;
  sourceTable: string;
  sourceRecordId: number;
  scrapedListingId: number | null;
  changeType: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  address: string;
  source: string;
  suite: string | null;
}

interface ScrapedPermit {
  id: number;
  permitNumber: string;
  permitDate: string | null;
  address: string;
  owner: string | null;
  permitValue: number | null;
  description: string | null;
  permitStatus: string | null;
  firstSeen: string;
  lastSeen: string;
}

interface ScrapedTender {
  id: number;
  tenderName: string;
  organization: string;
  closingDate: string | null;
  description: string | null;
  category: string;
  status: string;
  firstSeen: string;
  lastSeen: string;
}

type TabType = 'listings' | 'permits' | 'tenders' | 'assessments' | 'runs' | 'changes';

export default function ScrapedDataPage() {
  const [activeTab, setActiveTab] = useState<TabType>('listings');
  const [listings, setListings] = useState<ScrapedListing[]>([]);
  const [permits, setPermits] = useState<ScrapedPermit[]>([]);
  const [tenders, setTenders] = useState<ScrapedTender[]>([]);
  const [runs, setRuns] = useState<ScraperRun[]>([]);
  const [changes, setChanges] = useState<ListingChange[]>([]);
  const [changesPendingCount, setChangesPendingCount] = useState(0);
  const [changesFilter, setChangesFilter] = useState<string>('pending_review');
  const [changesTypeFilter, setChangesTypeFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [previewData, setPreviewData] = useState<ReleaseResponse | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [releaseSuccess, setReleaseSuccess] = useState<ReleaseResponse | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [showMutedModal, setShowMutedModal] = useState(false);
  const [mutedAddresses, setMutedAddresses] = useState<MutedAddress[]>([]);
  const [muteDialog, setMuteDialog] = useState<{ address: string; listingId: number } | null>(null);
  const [muteReason, setMuteReason] = useState('');

  // Cross-source dedup: normalized address → set of brokerage sources
  const addressSourceMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of listings) {
      const norm = l.address.toLowerCase().replace(/,?\s*(saskatoon|sk|s\d\w\s?\d\w\d).*/i, '').trim();
      if (!map.has(norm)) map.set(norm, new Set());
      map.get(norm)!.add(l.brokerageFirm || 'Unknown');
    }
    return map;
  }, [listings]);

  useEffect(() => {
    loadData();
  }, [activeTab, showDismissed, changesFilter, changesTypeFilter]);

  // Load pending changes count on mount for badge
  useEffect(() => {
    fetch('/api/scraped/changes?status=pending_review')
      .then(r => r.json())
      .then(d => setChangesPendingCount(d.pendingCount || 0))
      .catch(() => {});
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      let endpoint = '';
      switch (activeTab) {
        case 'listings':
          endpoint = `/api/scraped/listings?showDismissed=${showDismissed}`;
          break;
        case 'permits':
          endpoint = '/api/scraped/permits';
          break;
        case 'tenders':
          endpoint = '/api/scraped/tenders';
          break;
        case 'runs':
          endpoint = '/api/scraped/runs';
          break;
        case 'changes':
          endpoint = `/api/scraped/changes?status=${changesFilter}${changesTypeFilter ? `&changeType=${changesTypeFilter}` : ''}`;
          break;
        default:
          return;
      }

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`Failed to fetch ${activeTab}`);
      const data = await response.json();
      
      switch (activeTab) {
        case 'listings':
          setListings(data.listings || []);
          break;
        case 'permits':
          setPermits(data.permits || []);
          break;
        case 'tenders':
          setTenders(data.tenders || []);
          break;
        case 'runs':
          setRuns(data.runs || []);
          break;
        case 'changes':
          setChanges(data.changes || []);
          setChangesPendingCount(data.pendingCount || 0);
          break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const loadMutedAddresses = async () => {
    try {
      const res = await fetch('/api/scraped/dismiss');
      const data = await res.json();
      setMutedAddresses(data.mutedAddresses || []);
    } catch {}
  };

  const [runningScraper, setRunningScraper] = useState<string | null>(null);
  const [scraperMessage, setScraperMessage] = useState<string | null>(null);

  const runScraper = async (source: string) => {
    if (runningScraper) return;
    setRunningScraper(source);
    setScraperMessage(`Starting ${source.toUpperCase()} scraper...`);
    try {
      const response = await fetch('/api/scraped/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      const data = await response.json();
      if (!response.ok) {
        setScraperMessage(data.alreadyRunning ? `⚠ ${source.toUpperCase()} is already running` : `❌ ${data.error || 'Failed to start'}`);
        setRunningScraper(null);
        setTimeout(() => setScraperMessage(null), 5000);
        return;
      }
      setScraperMessage(`✅ ${source.toUpperCase()} scraper is running — this may take a few minutes`);
      if (activeTab === 'runs') await loadData();
      // Poll for completion
      const pollInterval = setInterval(async () => {
        try {
          const res = await fetch('/api/scraped/runs');
          if (!res.ok) return;
          const runs = await res.json();
          const latest = runs.find((r: { source: string }) => r.source === source);
          if (latest && latest.status !== 'running') {
            clearInterval(pollInterval);
            const msg = latest.status === 'completed'
              ? `✅ ${source.toUpperCase()} done: ${latest.itemsNew} new, ${latest.itemsUpdated} updated`
              : `❌ ${source.toUpperCase()} failed`;
            setScraperMessage(msg);
            setRunningScraper(null);
            await loadData();
            setTimeout(() => setScraperMessage(null), 10000);
          }
        } catch {}
      }, 5000);
    } catch (err) {
      setScraperMessage(`❌ ${err instanceof Error ? err.message : 'Failed to run scraper'}`);
      setRunningScraper(null);
      setTimeout(() => setScraperMessage(null), 5000);
    }
  };

  const handleDismiss = async (listingId: number) => {
    try {
      await fetch('/api/scraped/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss', listingId }),
      });
      setListings(prev => prev.filter(l => l.id !== listingId));
    } catch {}
  };

  const handleUndismiss = async (listingId: number) => {
    try {
      await fetch('/api/scraped/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undismiss', listingId }),
      });
      loadData();
    } catch {}
  };

  const handleMute = async () => {
    if (!muteDialog) return;
    try {
      await fetch('/api/scraped/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mute', address: muteDialog.address, reason: muteReason || null }),
      });
      setMuteDialog(null);
      setMuteReason('');
      loadData();
    } catch {}
  };

  const handleUnmute = async (id: number) => {
    try {
      await fetch('/api/scraped/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unmute', id }),
      });
      loadMutedAddresses();
      loadData();
    } catch {}
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const unreleased = listings.filter((l) => !l.releasedTo && !l.dismissed);
    if (selectedIds.size === unreleased.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unreleased.map((l) => l.id)));
    }
  };

  const handlePreview = async () => {
    if (selectedIds.size === 0) return;
    setReleasing(true);
    try {
      const res = await fetch("/api/scraped/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingIds: Array.from(selectedIds), action: "preview" }),
      });
      const data = await res.json();
      setPreviewData(data);
    } catch {
      alert("Failed to preview release");
    } finally {
      setReleasing(false);
    }
  };

  const handleRelease = async () => {
    if (selectedIds.size === 0) return;
    setReleasing(true);
    try {
      const res = await fetch("/api/scraped/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingIds: Array.from(selectedIds), action: "release" }),
      });
      const data = await res.json();
      setReleaseSuccess(data);
      setPreviewData(null);
      setSelectedIds(new Set());
      loadData();
    } catch {
      alert("Failed to release");
    } finally {
      setReleasing(false);
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatRent = (listing: ScrapedListing) => {
    if (listing.askingPrice) return formatCurrency(listing.askingPrice);
    if (!listing.askingRent) return 'N/A';
    const rent = listing.askingRent;
    const basis = listing.rentBasis;
    if (basis === 'psf_net') return `$${rent} PSF Net`;
    if (basis === 'psf_gross') return `$${rent} PSF Gross`;
    if (basis === 'monthly_gross') return `$${rent.toLocaleString()}/mo Gross`;
    if (basis === 'monthly_net') return `$${rent.toLocaleString()}/mo Net`;
    return `$${rent}/sf`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-CA');
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return 'N/A';
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Scraped Data</h1>
        <span className="px-2 py-1 text-xs bg-accent/15 text-accent rounded">BETA</span>
      </div>

      <p className="text-muted">
        Automated data collection from brokerages, permits, and tenders across Saskatoon.
      </p>

      {/* Tab Navigation */}
      <div className="border-b border-card-border">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: 'listings', label: 'Listings', count: listings.length },
            { key: 'permits', label: 'Permits', count: permits.length },
            { key: 'tenders', label: 'Tenders', count: tenders.length },
            { key: 'assessments', label: 'Assessments', count: 0, disabled: true },
            { key: 'runs', label: 'Scraper Runs', count: runs.length },
            { key: 'changes', label: 'Changes', count: changesPendingCount, badge: true },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => !tab.disabled && setActiveTab(tab.key as TabType)}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.key
                  ? 'border-accent text-accent'
                  : tab.disabled
                  ? 'border-transparent text-muted/50 cursor-not-allowed'
                  : 'border-transparent text-muted hover:text-foreground hover:border-muted'
              }`}
              disabled={tab.disabled}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                  (tab as any).badge ? 'bg-accent/20 text-accent font-semibold' : 'bg-card border border-card-border'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Listings Tab */}
          {activeTab === 'listings' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-foreground">Brokerage Listings</h2>
                <div className="flex gap-2 items-center">
                  <label className="flex items-center gap-1.5 text-sm text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDismissed}
                      onChange={(e) => setShowDismissed(e.target.checked)}
                      className="rounded"
                    />
                    Show Dismissed
                  </label>
                  <button
                    onClick={() => { setShowMutedModal(true); loadMutedAddresses(); }}
                    className="px-3 py-1 text-sm bg-zinc-500/10 text-muted rounded hover:bg-zinc-500/20"
                  >
                    🔇 Muted Addresses
                  </button>
                  {scraperMessage && (
                    <div className={`px-3 py-1.5 text-sm rounded flex items-center gap-2 ${
                      scraperMessage.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-400' :
                      scraperMessage.startsWith('❌') ? 'bg-red-500/10 text-red-400' :
                      scraperMessage.startsWith('⚠') ? 'bg-yellow-500/10 text-yellow-400' :
                      'bg-accent/10 text-accent'
                    }`}>
                      {runningScraper && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                      {scraperMessage}
                    </div>
                  )}
                  <button
                    onClick={() => runScraper('icr')}
                    disabled={!!runningScraper}
                    className="px-3 py-1 text-sm bg-accent/10 text-accent rounded hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {runningScraper === 'icr' ? 'Running…' : 'Run ICR'}
                  </button>
                  <button
                    onClick={() => runScraper('cbre')}
                    disabled={!!runningScraper}
                    className="px-3 py-1 text-sm bg-accent/10 text-accent rounded hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Run CBRE
                  </button>
                  <button
                    onClick={() => runScraper('colliers')}
                    disabled={!!runningScraper}
                    className="px-3 py-1 text-sm bg-accent/10 text-accent rounded hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Run Colliers
                  </button>
                  <button
                    onClick={() => runScraper('cushman')}
                    disabled={!!runningScraper}
                    className="px-3 py-1 text-sm bg-accent/10 text-accent rounded hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {runningScraper === 'cushman' ? 'Running…' : 'Run Cushman'}
                  </button>
                  <button
                    onClick={() => runScraper('commgroup')}
                    disabled={!!runningScraper}
                    className="px-3 py-1 text-sm bg-accent/10 text-accent rounded hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {runningScraper === 'commgroup' ? 'Running…' : 'Run CommGroup'}
                  </button>
                  <button
                    onClick={() => runScraper('concorde')}
                    disabled={!!runningScraper}
                    className="px-3 py-1 text-sm bg-accent/10 text-accent rounded hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {runningScraper === 'concorde' ? 'Running…' : 'Run Concorde'}
                  </button>
                  <button
                    onClick={() => runScraper('fortress')}
                    disabled={!!runningScraper}
                    className="px-3 py-1 text-sm bg-accent/10 text-accent rounded hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {runningScraper === 'fortress' ? 'Running…' : 'Run Fortress'}
                  </button>
                  <button
                    onClick={() => runScraper('reddee')}
                    disabled={!!runningScraper}
                    className="px-3 py-1 text-sm bg-accent/10 text-accent rounded hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {runningScraper === 'reddee' ? 'Running…' : 'Run Reddee'}
                  </button>
                </div>
              </div>

              {/* Mute Dialog */}
              {muteDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-card border border-card-border rounded-lg p-6 max-w-md w-full space-y-4">
                    <h3 className="text-foreground font-medium">Mute Address</h3>
                    <p className="text-sm text-muted">Mute all listings at <strong className="text-foreground">{muteDialog.address}</strong>?</p>
                    <input
                      type="text"
                      placeholder="Reason (optional)"
                      value={muteReason}
                      onChange={(e) => setMuteReason(e.target.value)}
                      className="w-full px-3 py-2 bg-card border border-card-border rounded text-sm text-foreground"
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setMuteDialog(null); setMuteReason(''); }} className="px-3 py-1.5 text-sm text-muted hover:text-foreground">Cancel</button>
                      <button onClick={handleMute} className="px-3 py-1.5 text-sm bg-red-500/20 text-red-400 rounded hover:bg-red-500/30">Mute</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Muted Addresses Modal */}
              {showMutedModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-card border border-card-border rounded-lg p-6 max-w-lg w-full space-y-4 max-h-[80vh] overflow-y-auto">
                    <div className="flex items-center justify-between">
                      <h3 className="text-foreground font-medium">Muted Addresses</h3>
                      <button onClick={() => setShowMutedModal(false)} className="text-muted hover:text-foreground">✕</button>
                    </div>
                    {mutedAddresses.length === 0 ? (
                      <p className="text-sm text-muted">No muted addresses.</p>
                    ) : (
                      <div className="space-y-2">
                        {mutedAddresses.map((m) => (
                          <div key={m.id} className="flex items-center justify-between p-2 border border-card-border rounded text-sm">
                            <div>
                              <div className="text-foreground">{m.address}</div>
                              {m.reason && <div className="text-xs text-muted">{m.reason}</div>}
                              <div className="text-xs text-muted/60">{formatDate(m.mutedAt)}</div>
                            </div>
                            <button onClick={() => handleUnmute(m.id)} className="px-2 py-1 text-xs bg-green-500/10 text-green-400 rounded hover:bg-green-500/20">
                              Unmute
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Release Action Bar */}
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 p-3 bg-accent/10 border border-accent/20 rounded-lg">
                  <span className="text-sm text-foreground font-medium">{selectedIds.size} selected</span>
                  <button onClick={handlePreview} disabled={releasing}
                    className="px-3 py-1.5 text-sm bg-card border border-card-border text-foreground rounded hover:bg-card-hover disabled:opacity-50">
                    Preview Release
                  </button>
                  <button onClick={handleRelease} disabled={releasing}
                    className="px-3 py-1.5 text-sm bg-accent text-white rounded hover:bg-accent/80 disabled:opacity-50">
                    {releasing ? "Releasing..." : "Release Selected"}
                  </button>
                  <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 text-sm text-muted hover:text-foreground">
                    Clear
                  </button>
                </div>
              )}

              {/* Preview Modal */}
              {previewData && (
                <div className="p-4 bg-card border border-card-border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-foreground font-medium">Release Preview</h3>
                    <button onClick={() => setPreviewData(null)} className="text-muted hover:text-foreground text-sm">✕ Close</button>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded p-3 text-center">
                      <p className="text-2xl font-bold text-blue-400">{previewData.counts.downtown}</p>
                      <p className="text-xs text-muted">Downtown Office</p>
                    </div>
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded p-3 text-center">
                      <p className="text-2xl font-bold text-purple-400">{previewData.counts.suburban}</p>
                      <p className="text-xs text-muted">Suburban Office</p>
                    </div>
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded p-3 text-center">
                      <p className="text-2xl font-bold text-amber-400">{previewData.counts.industrial}</p>
                      <p className="text-xs text-muted">Industrial</p>
                    </div>
                  </div>
                  {previewData.results.filter(r => r.inventoryMatch === false && !r.error).length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded p-3 flex items-center gap-2">
                      <span className="text-red-400 text-sm font-medium">⚠ {previewData.results.filter(r => r.inventoryMatch === false && !r.error).length} listing(s) have no matching inventory record</span>
                      <span className="text-xs text-muted">— these will still release but should be investigated</span>
                    </div>
                  )}
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {previewData.results.map((r) => (
                      <div key={r.listingId} className="flex items-center gap-2 text-xs py-1 border-b border-card-border/50">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          r.classification === "downtown_office" ? "bg-blue-500/20 text-blue-300" :
                          r.classification === "industrial" ? "bg-amber-500/20 text-amber-300" :
                          "bg-purple-500/20 text-purple-300"
                        }`}>{r.classification.replace("_", " ")}</span>
                        <span className="text-foreground">{r.address}</span>
                        {r.matchedBuilding && <span className="text-muted">→ {r.matchedBuilding}</span>}
                        {r.inventoryMatch === false && !r.error && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/20 text-red-300 font-medium" title="No matching building in inventory — needs investigation">⚠ NO INVENTORY MATCH</span>
                        )}
                        {r.error && <span className="text-red-400">{r.error}</span>}
                      </div>
                    ))}
                  </div>
                  <button onClick={handleRelease} disabled={releasing}
                    className="w-full px-3 py-2 text-sm bg-accent text-white rounded hover:bg-accent/80 disabled:opacity-50">
                    {releasing ? "Releasing..." : "Confirm Release"}
                  </button>
                </div>
              )}

              {/* Release Success */}
              {releaseSuccess && (
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="text-green-400 font-medium">
                      ✅ Released {releaseSuccess.counts.downtown + releaseSuccess.counts.suburban + releaseSuccess.counts.industrial} listings
                      ({releaseSuccess.counts.downtown} downtown, {releaseSuccess.counts.suburban} suburban, {releaseSuccess.counts.industrial} industrial)
                    </p>
                    <button onClick={() => setReleaseSuccess(null)} className="text-muted hover:text-foreground text-sm">✕</button>
                  </div>
                </div>
              )}

              {listings.length === 0 ? (
                <div className="text-center py-12 text-muted">
                  <p>No listings scraped yet.</p>
                  <p className="text-sm mt-1">Run a scraper to collect data from brokerages.</p>
                </div>
              ) : (
                <div className="bg-card border border-card-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-card-hover border-b border-card-border">
                        <tr>
                          <th className="px-3 py-3 text-left">
                            <input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === listings.filter(l => !l.releasedTo && !l.dismissed).length}
                              onChange={toggleSelectAll} className="rounded" />
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Address</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Suite</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Price/Rent</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Occ Cost</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">SF</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Brokerage</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Last Seen</th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-card-border">
                        {listings.map((listing) => (
                          <tr key={listing.id} className={`hover:bg-card-hover ${listing.releasedTo ? "opacity-60" : ""} ${listing.dismissed ? "opacity-40" : ""}`}>
                            <td className="px-3 py-3">
                              {listing.releasedTo || listing.dismissed ? (
                                <span className="text-muted text-xs">—</span>
                              ) : (
                                <input type="checkbox" checked={selectedIds.has(listing.id)}
                                  onChange={() => toggleSelect(listing.id)} className="rounded" />
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-foreground">
                              {listing.address}
                              {(() => {
                                const norm = listing.address.toLowerCase().replace(/,?\s*(saskatoon|sk|s\d\w\s?\d\w\d).*/i, '').trim();
                                const sources = addressSourceMap.get(norm);
                                if (sources && sources.size > 1) {
                                  return (
                                    <span
                                      className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded bg-accent/10 text-accent cursor-default"
                                      title={`Listed by: ${Array.from(sources).join(', ')}`}
                                    >
                                      📋 {sources.size} sources
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {listing.suite || '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              <span className="capitalize">{listing.propertyType}</span>
                              {listing.propertyTypeFlag === 'mixed_retail_office' && (
                                <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-orange-500/20 text-orange-400 font-medium">RETAIL?</span>
                              )}
                              {listing.propertyTypeFlag === 'mixed_industrial_office' && (
                                <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-yellow-500/20 text-yellow-400 font-medium">INDUSTRIAL?</span>
                              )}
                              <span className="mx-1">·</span>
                              <span className="capitalize">{listing.listingType}</span>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {formatRent(listing)}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {listing.occupancyCost ? `$${listing.occupancyCost.toFixed(2)}` : '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {listing.squareFeet ? listing.squareFeet.toLocaleString() : 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              <div>
                                <div className="font-medium">{listing.brokerageFirm}</div>
                                {listing.broker && (
                                  <div className="text-xs text-muted/70">{listing.broker}</div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {listing.dismissed ? (
                                <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-500/20 text-zinc-400">
                                  dismissed
                                </span>
                              ) : listing.releasedTo ? (
                                <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/10 text-green-400">
                                  {listing.releasedTo.replace("_", " ")}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-500/10 text-muted">
                                  unreleased
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {formatDate(listing.lastSeen)}
                            </td>
                            <td className="px-3 py-3 text-sm">
                              <div className="flex gap-1">
                                {listing.dismissed ? (
                                  <button
                                    onClick={() => handleUndismiss(listing.id)}
                                    className="px-1.5 py-0.5 text-xs text-green-400 hover:bg-green-500/10 rounded"
                                    title="Restore"
                                  >
                                    ↩
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => handleDismiss(listing.id)}
                                      className="px-1.5 py-0.5 text-xs text-muted hover:text-red-400 hover:bg-red-500/10 rounded"
                                      title="Dismiss"
                                    >
                                      ✕
                                    </button>
                                    <button
                                      onClick={() => setMuteDialog({ address: listing.address, listingId: listing.id })}
                                      className="px-1.5 py-0.5 text-xs text-muted hover:text-orange-400 hover:bg-orange-500/10 rounded"
                                      title="Mute address"
                                    >
                                      🔇
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Permits Tab */}
          {activeTab === 'permits' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-foreground">Building Permits</h2>
                <button
                  onClick={() => runScraper('epermitting')}
                  disabled={!!runningScraper}
                  className="px-3 py-1 text-sm bg-accent/10 text-accent rounded hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {runningScraper === 'epermitting' ? 'Running…' : 'Run E-Permitting'}
                </button>
              </div>

              {permits.length === 0 ? (
                <div className="text-center py-12 text-muted">
                  <p>No permits scraped yet.</p>
                  <p className="text-sm mt-1">Run the e-permitting scraper to collect commercial permits.</p>
                </div>
              ) : (
                <div className="bg-card border border-card-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-card-hover border-b border-card-border">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Permit #</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Address</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Owner</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Value</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-card-border">
                        {permits.map((permit) => (
                          <tr key={permit.id} className="hover:bg-card-hover">
                            <td className="px-4 py-3 text-sm font-medium text-foreground">
                              {permit.permitNumber}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {permit.address}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {permit.owner || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted font-medium">
                              {permit.permitValue ? formatCurrency(permit.permitValue) : 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {formatDate(permit.permitDate)}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {permit.permitStatus || 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tenders Tab */}
          {activeTab === 'tenders' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-foreground">Government Tenders</h2>
                <button
                  onClick={() => runScraper('sasktenders')}
                  disabled={!!runningScraper}
                  className="px-3 py-1 text-sm bg-accent/10 text-accent rounded hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {runningScraper === 'sasktenders' ? 'Running…' : 'Run Sasktenders'}
                </button>
              </div>

              {tenders.length === 0 ? (
                <div className="text-center py-12 text-muted">
                  <p>No tenders scraped yet.</p>
                  <p className="text-sm mt-1">Run the Sasktenders scraper to collect property-related tenders.</p>
                </div>
              ) : (
                <div className="bg-card border border-card-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-card-hover border-b border-card-border">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Tender Name</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Organization</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Category</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Closing Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-card-border">
                        {tenders.map((tender) => (
                          <tr key={tender.id} className="hover:bg-card-hover">
                            <td className="px-4 py-3 text-sm font-medium text-foreground">
                              {tender.tenderName}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {tender.organization}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              <span className="px-2 py-1 text-xs bg-card border border-card-border rounded-full capitalize">
                                {tender.category}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {formatDate(tender.closingDate)}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              <span className={`px-2 py-1 text-xs rounded-full capitalize ${
                                tender.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'
                              }`}>
                                {tender.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Assessments Tab */}
          {activeTab === 'assessments' && (
            <div className="text-center py-12 text-muted">
              <p>Property assessment scraper coming soon.</p>
              <p className="text-sm mt-1">Will provide assessed value, lot size, zoning, and year built data.</p>
            </div>
          )}

          {/* Changes Tab */}
          {activeTab === 'changes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-foreground">Listing Changes</h2>
                <div className="flex gap-2 items-center">
                  <select
                    value={changesFilter}
                    onChange={(e) => setChangesFilter(e.target.value)}
                    className="px-2 py-1 text-sm bg-card border border-card-border rounded text-foreground"
                  >
                    <option value="pending_review">Pending Review</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="dismissed">Dismissed</option>
                    <option value="all">All</option>
                  </select>
                  <select
                    value={changesTypeFilter}
                    onChange={(e) => setChangesTypeFilter(e.target.value)}
                    className="px-2 py-1 text-sm bg-card border border-card-border rounded text-foreground"
                  >
                    <option value="">All Types</option>
                    <option value="rate_change">Rate Change</option>
                    <option value="sf_change">SF Change</option>
                    <option value="possibly_leased">Possibly Leased</option>
                    <option value="new_availability">New Availability</option>
                    <option value="new_listing">New Listing</option>
                  </select>
                </div>
              </div>

              {changes.length === 0 ? (
                <div className="text-center py-12 text-muted">
                  <p>No changes to review.</p>
                </div>
              ) : (
                <div className="bg-card border border-card-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-card-hover border-b border-card-border">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Address</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Change Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Field</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Old → New</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Status</th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-card-border">
                        {changes.map((change) => (
                          <tr key={change.id} className="hover:bg-card-hover">
                            <td className="px-4 py-3 text-sm font-medium text-foreground">
                              {change.address || `${change.sourceTable} #${change.sourceRecordId}`}
                              {change.suite && <span className="text-muted ml-1">({change.suite})</span>}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                change.changeType === 'rate_change' ? 'bg-blue-500/10 text-blue-400' :
                                change.changeType === 'sf_change' ? 'bg-purple-500/10 text-purple-400' :
                                change.changeType === 'possibly_leased' ? 'bg-amber-500/10 text-amber-400' :
                                'bg-green-500/10 text-green-400'
                              }`}>
                                {change.changeType.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {change.field || '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {change.oldValue && change.newValue ? (
                                <span>
                                  <span className="text-red-400 line-through">{change.oldValue}</span>
                                  <span className="mx-1">→</span>
                                  <span className="text-green-400">{change.newValue}</span>
                                </span>
                              ) : change.newValue ? (
                                <span className="text-green-400">{change.newValue}</span>
                              ) : change.oldValue ? (
                                <span className="text-red-400">{change.oldValue}</span>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {formatDate(change.createdAt)}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                change.status === 'pending_review' ? 'bg-amber-500/10 text-amber-400' :
                                change.status === 'reviewed' ? 'bg-green-500/10 text-green-400' :
                                'bg-zinc-500/10 text-zinc-400'
                              }`}>
                                {change.status.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-sm">
                              {change.status === 'pending_review' && (
                                <div className="flex gap-1">
                                  {change.changeType === 'possibly_leased' ? (
                                    <>
                                      <button
                                        onClick={async () => {
                                          await fetch('/api/scraped/changes', {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ id: change.id, action: 'confirm_leased' }),
                                          });
                                          loadData();
                                        }}
                                        className="px-2 py-0.5 text-xs bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded"
                                        title="Confirm leased — marks unit as absorbed/leased"
                                      >
                                        Confirm Leased
                                      </button>
                                      <button
                                        onClick={async () => {
                                          await fetch('/api/scraped/changes', {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ id: change.id, status: 'dismissed' }),
                                          });
                                          loadData();
                                        }}
                                        className="px-2 py-0.5 text-xs text-muted hover:text-foreground hover:bg-card-hover rounded"
                                        title="Dismiss — listing is still active"
                                      >
                                        Dismiss
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        onClick={async () => {
                                          await fetch('/api/scraped/changes', {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ id: change.id, status: 'reviewed' }),
                                          });
                                          loadData();
                                        }}
                                        className="px-2 py-0.5 text-xs text-green-400 hover:bg-green-500/10 rounded"
                                        title="Approve"
                                      >
                                        ✓
                                      </button>
                                      <button
                                        onClick={async () => {
                                          await fetch('/api/scraped/changes', {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ id: change.id, status: 'dismissed' }),
                                          });
                                          loadData();
                                        }}
                                        className="px-2 py-0.5 text-xs text-muted hover:text-red-400 hover:bg-red-500/10 rounded"
                                        title="Dismiss"
                                      >
                                        ✕
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Scraper Runs Tab */}
          {activeTab === 'runs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-foreground">Scraper Run History</h2>
                <button
                  onClick={loadData}
                  className="px-3 py-1 text-sm bg-accent/10 text-accent rounded hover:bg-accent/20"
                >
                  Refresh
                </button>
              </div>

              {runs.length === 0 ? (
                <div className="text-center py-12 text-muted">
                  <p>No scraper runs yet.</p>
                  <p className="text-sm mt-1">Scraper runs will appear here once you start collecting data.</p>
                </div>
              ) : (
                <div className="bg-card border border-card-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-card-hover border-b border-card-border">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Source</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Results</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Duration</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Started</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Completed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-card-border">
                        {runs.map((run) => (
                          <tr key={run.id} className="hover:bg-card-hover">
                            <td className="px-4 py-3 text-sm font-medium text-foreground uppercase">
                              {run.source}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-1 text-xs rounded-full capitalize ${
                                run.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                                run.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                                run.status === 'partial' ? 'bg-yellow-500/10 text-yellow-400' :
                                'bg-blue-500/10 text-blue-400'
                              }`}>
                                {run.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              <div>
                                <span className="text-green-400">{run.itemsNew} new</span>
                                {run.itemsUpdated > 0 && (
                                  <span className="ml-2 text-blue-400">{run.itemsUpdated} updated</span>
                                )}
                              </div>
                              <div className="text-xs text-muted/70">
                                {run.itemsFound} total found
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {formatDuration(run.duration)}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {formatDate(run.startedAt)}
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {formatDate(run.completedAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
