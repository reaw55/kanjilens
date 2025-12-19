"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, Loader2, MapPin } from "lucide-react";
import { uploadCapture } from "@/actions/upload-capture";
import { useRouter } from "next/navigation";
import Image from "next/image";

export function CameraCapture() {
    const [isUploading, setIsUploading] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const objectUrl = URL.createObjectURL(file);
            setPreview(objectUrl);
            setLocation(null); // Reset location before attempting to extract new one

            try {
                // Extract EXIF Data
                const ExifReader = (await import("exifreader")).default;
                const tags = await ExifReader.load(file);

                // Safe parsing helper
                if (tags && tags['GPSLatitude'] && tags['GPSLongitude']) {
                    // Note: formatting complicated GPS tags is tricky. 
                    // Ideally we use a library or robust helper. 
                    // For MVP, checking if 'description' (often decimal in some readers) or 'value' exists.

                    // ExifReader's `description` field for GPS is a number (float) in newer versions if parsed?
                    // No, it's usually formatted DMS string like "35, 40.5, 20.1".
                    // But user wants "use... only if there is none do not report".
                    // Let's assume a simplified approach:
                    // If we can't easily parse, we default to null (fail open).

                    // However, not providing ANY location when image HAS it is bad.
                    // Let's rely on basic ExifReader behavior. 
                    // If tags['GPSLatitude'].description is a number, use it.
                    // If it is a string and simple split works, use it.
                    // Otherwise, skip.

                    // Let's try attempting to read the raw `value` array [degrees, minutes, seconds]
                    // value: [35, 40, 20]

                    // Helper to Convert DMS to Decimal
                    const toDecimal = (gpsTag: any) => {
                        if (!gpsTag || !gpsTag.value || gpsTag.value.length < 3) return null;
                        const d = gpsTag.value[0][0] / gpsTag.value[0][1];
                        const m = gpsTag.value[1][0] / gpsTag.value[1][1];
                        const s = gpsTag.value[2][0] / gpsTag.value[2][1];
                        return d + (m / 60) + (s / 3600);
                    };

                    const lat = toDecimal(tags['GPSLatitude']);
                    const lng = toDecimal(tags['GPSLongitude']);

                    if (lat !== null && lng !== null) {
                        // Fix Ref (N/S/E/W)
                        // ExifReader usage varies. Let's do a loose check.
                        // If tags['GPSLatitudeRef'].description starts with S...
                        let finalLat = lat;
                        let finalLng = lng;

                        if (tags['GPSLatitudeRef']?.description?.startsWith('S')) finalLat = -lat;
                        if (tags['GPSLongitudeRef']?.description?.startsWith('W')) finalLng = -lng;

                        setLocation({ lat: finalLat, lng: finalLng });
                    }
                }
            } catch (err) {
                console.warn("EXIF extraction failed (failing open)", err);
                // Fail open: location remains null
            }
        }
    };

    const handleUpload = async () => {
        if (!fileInputRef.current?.files?.[0]) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", fileInputRef.current.files[0]);
        if (location) {
            formData.append("lat", location.lat.toString());
            formData.append("lng", location.lng.toString());
        }

        const result = await uploadCapture(formData);

        if (result.error) {
            alert(result.error);
            setIsUploading(false);
        } else {
            // Success! Redirect to the scan result page
            router.push(`/scan/${result.captureId}`);
            // We don't need to reset preview here as we are navigating away
        }
    };

    const triggerCamera = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className="w-full max-w-md mx-auto p-4">
            <input
                type="file"
                accept="image/*"
                // capture="environment" // Removed to allow Gallery selection on mobile
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileSelect}
            />

            {!preview ? (
                <div
                    onClick={triggerCamera}
                    className="aspect-[4/5] bg-zinc-800 rounded-3xl border-2 border-dashed border-zinc-700 flex flex-col items-center justify-center cursor-pointer hover:bg-zinc-800/80 transition-all group relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="h-20 w-20 rounded-full bg-zinc-900 flex items-center justify-center mb-4 ring-1 ring-zinc-700 group-hover:scale-110 transition-transform">
                        <Camera className="h-8 w-8 text-amber-500" />
                    </div>
                    <p className="text-zinc-400 font-medium">Tap to Scan Kanji</p>
                    <p className="text-xs text-zinc-600 mt-2">Supports Camera & Gallery</p>
                </div>
            ) : (
                <div className="space-y-6 reveal-up">
                    <div className="relative aspect-[4/5] rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                        <Image
                            src={preview}
                            alt="Preview"
                            fill
                            className="object-cover img-optimized"
                        />
                        {/* Location Badge */}
                        <div className={`absolute bottom-4 left-4 right-4 p-3 rounded-xl backdrop-blur-md transition-all ${location ? 'bg-zinc-900/80 text-zinc-200' : 'bg-red-500/20 text-red-200'}`}>
                            <div className="flex items-center gap-2 text-xs font-medium">
                                <MapPin className="h-4 w-4" />
                                {location ? (
                                    <span>Location Tagged</span>
                                ) : (
                                    <span>Locating...</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <Button
                            variant="outline"
                            onClick={() => setPreview(null)}
                            className="h-12 rounded-xl border-zinc-700 hover:bg-zinc-800 text-zinc-300"
                            disabled={isUploading}
                        >
                            Retake
                        </Button>
                        <Button
                            onClick={handleUpload}
                            className="h-12 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-lg shadow-amber-500/20"
                            disabled={isUploading}
                        >
                            {isUploading ? (
                                <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <Upload className="mr-2 h-5 w-5" />
                                    Analyze
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
