
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
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
function MapUpdater({ center }: { center: [number, number] | null }) {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.setView(center, 13);
        }
    }, [center, map]);
    return null;
}

export default function MapView() {
    const [captures, setCaptures] = useState<any[]>([]);
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [selectedCapture, setSelectedCapture] = useState<any>(null);

    useEffect(() => {
        const supabase = createClient();

        async function fetchCaptures() {
            const { data } = await supabase.from("captures").select("*").not("geo_lat", "is", null);
            if (data) setCaptures(data);
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
                center={centerPosition}
                zoom={13}
                scrollWheelZoom={true}
                style={{ height: "100%", width: "100%" }}
                className="bg-zinc-950"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />

                <MapUpdater center={userLocation} />

                {captures.map(cap => {
                    const imageIcon = L.divIcon({
                        className: '!bg-transparent !border-0',
                        html: `<div class="relative w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-xl bg-zinc-800">
                                 <img src="${cap.image_url}" class="absolute inset-0 w-full h-full object-cover object-center" />
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
                                click: () => setSelectedCapture(cap)
                            }}
                        />
                    );
                })}
            </MapContainer>

            {/* Simple Lightbox Modal */}
            {selectedCapture && (
                <div className="absolute inset-0 z-[500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setSelectedCapture(null)}>
                    <div className="relative max-w-lg w-full bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

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
                                    <h3 className="text-xl font-bold text-white">Captured Text</h3>
                                    <p className="text-zinc-400 text-xs mt-1">
                                        {new Date(selectedCapture.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <Button size="icon" variant="ghost" onClick={() => setSelectedCapture(null)}>
                                    <span className="material-symbols-rounded">close</span>
                                </Button>
                            </div>

                            {/* Display detected words if any (simple view) */}
                            <div className="flex flex-wrap gap-2">
                                {selectedCapture.ocr_data?.text ? (
                                    <div className="text-zinc-300 text-sm italic">
                                        "{selectedCapture.ocr_data.text.substring(0, 100)}..."
                                    </div>
                                ) : (
                                    <span className="text-zinc-500 text-xs">No text detected</span>
                                )}
                            </div>

                            <div className="mt-6">
                                <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold" onClick={() => window.location.href = `/scan/${selectedCapture.id}`}>
                                    View Details & Learn
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Overlay Controls */}
            <div className="absolute top-4 left-4 z-[400] bg-zinc-900/90 backdrop-blur-md p-3 rounded-2xl border border-zinc-700 shadow-xl">
                <h3 className="font-bold text-zinc-100 text-sm">Discovery Map</h3>
                <p className="text-xs text-zinc-400">{captures.length} Locations Found</p>
            </div>
        </div>
    );
}
