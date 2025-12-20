
"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { MapContainer, TileLayer, Marker, Popup, useMap, Polygon } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { createClient } from "@/utils/supabase/client";

// Fix for Leaflet default icon issues in Next.js
const icon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Custom component to update map view
function MapUpdater({ center, captures }: { center: [number, number] | null, captures: any[] }) {
    const map = useMap();

    useEffect(() => {
        if (captures.length > 0) {
            // Create bounds from all capture locations
            const points = captures.map(c => [c.geo_lat, c.geo_lng] as [number, number]);
            const bounds = L.latLngBounds(points);

            if (bounds.isValid()) {
                map.fitBounds(bounds, {
                    padding: [50, 50],
                    maxZoom: 15
                });
            }
        } else if (center) {
            map.setView(center, 13);
        }
    }, [center, captures, map]);

    return null;
}

// Custom component to handle map events like zoom
function MapEventHandler({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
    const map = useMap();

    useEffect(() => {
        const handler = () => {
            onZoomChange(map.getZoom());
        };
        map.on('zoomend', handler);
        return () => {
            map.off('zoomend', handler);
        };
    }, [map, onZoomChange]);

    return null;
}

export default function MapView() {
    const [captures, setCaptures] = useState<any[]>([]);
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [selectedCapture, setSelectedCapture] = useState<any>(null);
    const [currentZoom, setCurrentZoom] = useState<number>(13); // Default zoom
    const [container, setContainer] = useState<HTMLElement | null>(null);

    useEffect(() => {
        if (typeof document !== "undefined") {
            setContainer(document.body);
        }
        const supabase = createClient();

        async function fetchCaptures() {
            const { data } = await supabase
                .from("captures")
                .select("*, vocabulary_captures(vocabulary_items(kanji_word, reading_kana, meaning_en))")
                .not("geo_lat", "is", null);
            if (data) {
                // Deduplicate by image_hash (User Request: "if picture have the same hash do not show on map")
                // We keep the FIRST occurrence of each hash
                // BUG FIX: Ensure we don't hide items that have NO hash (legacy or error)
                const uniqueCaptures: any[] = [];
                const seenHashes = new Set<string>();

                data.forEach(item => {
                    if (item.image_hash) {
                        if (!seenHashes.has(item.image_hash)) {
                            seenHashes.add(item.image_hash);
                            uniqueCaptures.push(item);
                        }
                    } else {
                        // Always keep items with no hash to be safe
                        uniqueCaptures.push(item);
                    }
                });

                setCaptures(uniqueCaptures);
            }
        }

        fetchCaptures();

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                setUserLocation([pos.coords.latitude, pos.coords.longitude]);
            });
        }
    }, []);

    // Default to Tokyo if no location
    const centerPosition: [number, number] = userLocation || [35.6762, 139.6503];

    return (
        <div className="h-screen w-full relative z-0">
            <MapContainer
                key="kanjilens-map"
                center={centerPosition}
                zoom={13}
                scrollWheelZoom={true}
                style={{ height: "100%", width: "100%" }}
                className="bg-zinc-950"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />

                <MapUpdater center={userLocation} captures={captures} />
                <MapEventHandler onZoomChange={setCurrentZoom} />

                {/* Render markers with Jitter for overlaps */}
                {(() => {
                    // 1. Group by location (to 4 decimal places to catch close ones)
                    const groups: Record<string, any[]> = {};
                    captures.forEach(cap => {
                        const key = `${cap.geo_lat.toFixed(4)},${cap.geo_lng.toFixed(4)}`;
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(cap);
                    });

                    // 2. Render all
                    return Object.values(groups).flatMap((group) => {
                        // CLUSTERING LOGIC:
                        // If zoomed out (< 16) AND multiple items, show stack.
                        // If zoomed in (>= 16), show expanded spiral.
                        const isStacked = group.length > 1 && currentZoom < 16;

                        if (group.length === 1 || isStacked) {
                            // Single marker OR Stacked Cluster
                            const cap = group[0]; // Show the first one as preview
                            const count = group.length;

                            // Badge HTML if stacked
                            const badgeHtml = isStacked
                                ? `<div class="absolute -top-2 -right-2 bg-amber-500 text-black text-[10px] font-bold h-5 min-w-[1.25rem] px-1 rounded-full border-2 border-zinc-900 flex items-center justify-center shadow-lg z-20">
                                     +${count - 1}
                                   </div>`
                                : '';

                            const imageIcon = L.divIcon({
                                className: '!bg-transparent !border-0',
                                html: `<div class="relative w-12 h-12 rounded-full overflow-visible group hover:scale-110 transition-transform">
                                         <div class="absolute inset-0 rounded-full overflow-hidden border-2 border-white shadow-xl bg-zinc-800">
                                            <img src="${cap.image_url}" class="absolute inset-0 w-full h-full object-cover object-center" />
                                         </div>
                                         ${badgeHtml}
                                       </div>`,
                                iconSize: [48, 48],
                                iconAnchor: [24, 24]
                            });

                            return (
                                <Marker
                                    key={cap.id}
                                    position={[cap.geo_lat, cap.geo_lng]}
                                    icon={imageIcon}
                                    eventHandlers={{
                                        click: () => {
                                            if (isStacked) {
                                                // Zoom in to expand
                                                const map = (window as any).currMap; // Hacky but simple, or pass map view model. 
                                                // Better: We don't have direct map ref here in loop.
                                                // Actually, Leaflet Marker click exposes 'target'.
                                                // But simpler: just set state or assume user zooms manually?
                                                // Let's just open the modal for the Top one for now, 
                                                // OR ideally we trigger a zoom.
                                                // Since we can't easily access map instance inside this loop without context,
                                                // let's just Open the lightbox. The user can manually zoom to see others.
                                                setSelectedCapture(cap);
                                            } else {
                                                setSelectedCapture(cap);
                                            }
                                        }
                                    }}
                                />
                            );
                        } else {
                            // Expanded Spiral (Zoomed In)
                            return group.map((cap, i) => {
                                const angle = (i / group.length) * 2 * Math.PI;
                                const radius = 0.0003; // Approx 30 meters
                                const lat = cap.geo_lat + (radius * Math.cos(angle));
                                const lng = cap.geo_lng + (radius * Math.sin(angle));

                                const imageIcon = L.divIcon({
                                    className: '!bg-transparent !border-0',
                                    html: `<div class="relative w-12 h-12 rounded-full overflow-hidden border-2 border-amber-500 shadow-xl bg-zinc-800 z-10 hover:scale-110 transition-transform" style="width: 48px; height: 48px;">
                                              <img src="${cap.image_url}" class="absolute inset-0 w-full h-full object-cover object-center" style="width: 100%; height: 100%; object-fit: cover;" />
                                               <div class="absolute -top-1 -right-1 bg-amber-500 text-black text-[8px] font-bold px-1 rounded-full border border-white">
                                                  ${i + 1}
                                               </div>
                                            </div>`,
                                    iconSize: [48, 48],
                                    iconAnchor: [24, 24]
                                });

                                return (
                                    <React.Fragment key={cap.id}>
                                        {/* Line to center */}
                                        <Polygon
                                            positions={[[cap.geo_lat, cap.geo_lng], [lat, lng]]}
                                            pathOptions={{ color: 'white', weight: 2, opacity: 0.5, dashArray: '4' }}
                                        />
                                        <Marker
                                            position={[lat, lng]}
                                            icon={imageIcon}
                                            eventHandlers={{ click: () => setSelectedCapture(cap) }}
                                        />
                                    </React.Fragment>
                                );
                            });
                        }
                    });
                })()}
            </MapContainer>

            {/* Simple Lightbox Modal - Portal to Body to break out of stacking context */}
            {container && selectedCapture && createPortal(
                <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setSelectedCapture(null)}>
                    <div className="relative max-w-lg w-full max-h-[90dvh] overflow-y-auto bg-zinc-900 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200 scrollbar-hide" onClick={e => e.stopPropagation()}>

                        <div className="relative aspect-[3/4] w-full bg-zinc-950">
                            <Image
                                src={selectedCapture.image_url}
                                alt="Capture"
                                fill
                                className="object-contain"
                            />
                        </div>

                        <div className="p-6">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-xl font-bold text-white">Translation</h3>
                                    <p className="text-zinc-400 text-xs mt-1">
                                        {new Date(selectedCapture.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <Button size="icon" variant="ghost" onClick={() => setSelectedCapture(null)}>
                                    <span className="material-symbols-rounded">close</span>
                                </Button>
                            </div>

                            {/* Display content */}
                            <div className="space-y-4">
                                {/* Translation - Main Content */}
                                {selectedCapture.translation ? (
                                    <div className="text-zinc-100 text-sm leading-relaxed">
                                        {selectedCapture.translation}
                                    </div>
                                ) : (
                                    <div className="text-zinc-500 text-sm italic">
                                        No translation available.
                                    </div>
                                )}

                                {/* Original Text - Secondary */}
                                <div className="pt-4 border-t border-zinc-800">
                                    <h4 className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
                                        <span className="material-symbols-rounded text-xs">image</span>
                                        Original Text
                                    </h4>
                                    {selectedCapture.ocr_data?.text ? (
                                        <div className="text-zinc-400 text-xs italic line-clamp-3">
                                            "{selectedCapture.ocr_data.text}"
                                        </div>
                                    ) : (
                                        <span className="text-zinc-500 text-xs">No text detected</span>
                                    )}
                                </div>

                                {/* Learned Words Section */}
                                <div className="pt-4 border-t border-zinc-800">
                                    <h4 className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
                                        <span className="material-symbols-rounded text-xs">school</span>
                                        Learned Words
                                    </h4>

                                    {selectedCapture.vocabulary_captures && selectedCapture.vocabulary_captures.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {selectedCapture.vocabulary_captures.map((vc: any, i: number) => {
                                                const vocab = vc.vocabulary_items;
                                                if (!vocab) return null;
                                                return (
                                                    <div key={i} className="bg-zinc-800/80 px-2 py-1 rounded text-xs text-zinc-300 border border-zinc-700 flex items-center gap-2">
                                                        <span className="text-amber-500 font-bold">{vocab.kanji_word}</span>
                                                        <span className="text-zinc-500 opacity-70">{vocab.meaning_en}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-zinc-500 text-xs italic">
                                            No words learned from this capture yet.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-6">
                                <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold" onClick={() => window.location.href = `/scan/${selectedCapture.id}`}>
                                    View Details & Learn
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>,
                container
            )}

            {/* Overlay Controls */}
            <div className="absolute top-4 left-4 z-[400] bg-zinc-900/90 backdrop-blur-md p-3 rounded-2xl border border-zinc-700 shadow-xl">
                <h3 className="font-bold text-zinc-100 text-sm">Discovery Map</h3>
                <p className="text-xs text-zinc-400">{captures.length} Locations Found</p>
            </div>
        </div>
    );
}

function MapPopup({ capture, onClose, container }: { capture: any, onClose: () => void, container: HTMLElement }) {
    const [translation, setTranslation] = useState(capture.translation);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        setTranslation(capture.translation);

        // Auto-generate if missing and we have text
        if (!capture.translation && capture.ocr_data?.text && !isGenerating) {
            setIsGenerating(true);
            import("@/actions/upload-capture").then(({ ensureCaptureTranslation }) => {
                ensureCaptureTranslation(capture.id).then(res => {
                    if (res.success && res.translation) {
                        setTranslation(res.translation);
                    }
                    setIsGenerating(false);
                });
            });
        }
    }, [capture]);

    return createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="relative max-w-lg w-full max-h-[90dvh] overflow-y-auto bg-zinc-900 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200 scrollbar-hide" onClick={e => e.stopPropagation()}>

                <div className="relative aspect-[3/4] w-full bg-zinc-950">
                    <Image
                        src={capture.image_url}
                        alt="Capture"
                        fill
                        className="object-contain"
                    />
                </div>

                <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h3 className="text-xl font-bold text-white">Translation</h3>
                            <p className="text-zinc-400 text-xs mt-1">
                                {new Date(capture.created_at).toLocaleDateString()}
                            </p>
                        </div>
                        <Button size="icon" variant="ghost" onClick={onClose}>
                            <span className="material-symbols-rounded">close</span>
                        </Button>
                    </div>

                    <div className="space-y-4">
                        {/* Translation */}
                        {translation ? (
                            <div className="text-zinc-100 text-sm leading-relaxed animate-in fade-in">
                                {translation}
                            </div>
                        ) : (!capture.ocr_data?.text) ? (
                            <div className="text-zinc-500 text-sm italic py-2 border-l-2 border-zinc-700 pl-3">
                                No text detected in this image.
                                <br />
                                <span className="text-xs opacity-70">Translation not available.</span>
                            </div>
                        ) : isGenerating ? (
                            <div className="flex items-center gap-2 text-amber-500 text-sm animate-pulse">
                                <span className="material-symbols-rounded animate-spin text-lg">autorenew</span>
                                Generating translation...
                            </div>
                        ) : (
                            <div className="text-zinc-500 text-sm italic">
                                No translation available.
                            </div>
                        )}

                        {/* Original Text */}
                        <div className="pt-4 border-t border-zinc-800">
                            <h4 className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
                                <span className="material-symbols-rounded text-xs">image</span>
                                Original Text
                            </h4>
                            {capture.ocr_data?.text ? (
                                <div className="text-zinc-400 text-xs italic line-clamp-3">
                                    "{capture.ocr_data.text}"
                                </div>
                            ) : (
                                <span className="text-zinc-500 text-xs">No text detected</span>
                            )}
                        </div>

                        {/* Learned Words */}
                        <div className="pt-4 border-t border-zinc-800">
                            <h4 className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
                                <span className="material-symbols-rounded text-xs">school</span>
                                Learned Words
                            </h4>

                            {capture.vocabulary_captures && capture.vocabulary_captures.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {capture.vocabulary_captures.map((vc: any, i: number) => {
                                        const vocab = vc.vocabulary_items;
                                        if (!vocab) return null;
                                        return (
                                            <div key={i} className="bg-zinc-800/80 px-2 py-1 rounded text-xs text-zinc-300 border border-zinc-700 flex items-center gap-2">
                                                <span className="text-amber-500 font-bold">{vocab.kanji_word}</span>
                                                <span className="text-zinc-500 opacity-70">{vocab.meaning_en}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-zinc-500 text-xs italic">
                                    No words learned from this capture yet.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-6">
                        <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold" onClick={() => window.location.href = `/scan/${capture.id}`}>
                            View Details & Learn
                        </Button>
                    </div>
                </div>
            </div>
        </div>,
        container
    );
}
