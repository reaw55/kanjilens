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
    const [croppedImage, setCroppedImage] = useState<Blob | null>(null);
    const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [browserLocation, setBrowserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const router = useRouter();

    const triggerCamera = () => {
        // 1. Try to get current location from Browser immediately
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setBrowserLocation({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    });
                },
                (err) => {
                    console.warn("Geolocation permission denied or failed", err);
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        }
        fileInputRef.current?.click();
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const objectUrl = URL.createObjectURL(file);
            setPreview(objectUrl);
            setCroppedImage(null);
            setAllPaths([]); // Reset paths
            setPathPoints([]); // Reset temp

            // Clear canvas
            if (canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }

            // Default to browser location if available (will be overwritten by EXIF if found)
            let detectedLocation = browserLocation;
            setLocation(detectedLocation);

            try {
                // ... import ExifReader ...
                const ExifReader = (await import("exifreader")).default;
                const tags = await ExifReader.load(file);

                // Safe parsing helper
                if (tags && tags['GPSLatitude'] && tags['GPSLongitude']) {
                    // ... (keep existing EXIF logic) ...
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
                        let finalLat = lat;
                        let finalLng = lng;

                        if (tags['GPSLatitudeRef']?.description?.startsWith('S')) finalLat = -lat;
                        if (tags['GPSLongitudeRef']?.description?.startsWith('W')) finalLng = -lng;

                        // EXIF is authoritative for the IMAGE, so it overrides browser location
                        detectedLocation = { lat: finalLat, lng: finalLng };
                        setLocation(detectedLocation);
                    }
                }
            } catch (err) {
                console.warn("EXIF extraction failed, keeping browser location if any", err);
            }
        }
    };

    // Drawing Logic
    const startDrawing = (e: React.PointerEvent) => {
        if (!canvasRef.current || !containerRef.current) return;
        setIsDrawing(true);
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.strokeStyle = '#f59e0b'; // Amber-500
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    };

    const draw = (e: React.PointerEvent) => {
        if (!isDrawing || !canvasRef.current || !containerRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = async () => {
        setIsDrawing(false);
        if (!canvasRef.current || !containerRef.current || !preview) return;

        // Calculate Bounding Box of the drawn path (approx based on canvas content)
        // Actually, it's easier to just track min/max while drawing, but lets scan the canvas pixels
        // Or simpler: Just upload the WHOLE image but mask it?
        // No, user wants to focus.

        // Let's implement actual crop:
        // 1. Get the drawing bounding box.
        // 2. Map to original image coordinates.
        // 3. Crop original image.

        // Optimally we'd track points. For now, since we only have the canvas content...
        // We will just assume if they drew, they want that AREA.
        // But scanning canvas pixels is slow.
        // For MVP: Let's just upload the whole image for now, BUT with a special flag? 
        // No, the requirement is "analyze ONLY the circled kanji".
        // So we MUST crop.

        // RE-IMPLEMENT DRAWING TO TRACK POINTS
        // (Since I can't easily scan canvas pixels without tracking)
    };

    // We need state to track MULTIPLE paths for masking
    // Array of Arrays of Points (Multi-stroke)
    const [allPaths, setAllPaths] = useState<{ x: number, y: number }[][]>([]);
    const [currentPath, setCurrentPath] = useState<{ x: number, y: number }[]>([]);

    const startDrawingTrack = (e: React.PointerEvent) => {
        setIsDrawing(true);
        setCurrentPath([]); // Start new stroke

        if (!canvasRef.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setCurrentPath([{ x, y }]);

        // We don't clear rect anymore, we redraw everything from state
        // To be performant, we just draw the NEW line on top of existing canvas?
        // Yes, until we clear.

        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        }
    };

    const drawTrack = (e: React.PointerEvent) => {
        if (!isDrawing || !canvasRef.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Add to current path
        setCurrentPath(prev => {
            const next = [...prev, { x, y }];
            return next;
        });

        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    };

    const stopDrawingTrack = async () => {
        setIsDrawing(false);
        if (currentPath.length > 2) {
            const newPaths = [...allPaths, currentPath];
            setAllPaths(newPaths);

            // Trigger masking/cropping update
            await updateMaskedImage(newPaths);
        }
        setCurrentPath([]);
    };

    // Repaint all paths (helper)
    const redrawCanvas = (paths: { x: number, y: number }[][]) => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#f59e0b';

        paths.forEach(path => {
            if (path.length === 0) return;
            ctx.beginPath();
            ctx.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
            ctx.stroke();

            // Optional: Close loop visually?
            // ctx.closePath(); ctx.stroke();
        });
    };

    const updateMaskedImage = async (paths: { x: number, y: number }[][]) => {
        if (!containerRef.current || !preview || paths.length === 0) return;

        const imgElement = containerRef.current.querySelector('img');
        if (!imgElement) return;

        // Calculate Geometry
        const { naturalWidth, naturalHeight, width: displayWidth, height: displayHeight } = imgElement;
        const imgAspect = naturalWidth / naturalHeight;
        const displayAspect = displayWidth / displayHeight;

        let renderedWidth, renderedHeight, offsetX, offsetY;

        if (displayAspect > imgAspect) {
            renderedHeight = displayHeight;
            renderedWidth = displayHeight * imgAspect;
            offsetX = (displayWidth - renderedWidth) / 2;
            offsetY = 0;
        } else {
            renderedWidth = displayWidth;
            renderedHeight = displayWidth / imgAspect;
            offsetX = 0;
            offsetY = (displayHeight - renderedHeight) / 2;
        }

        const scale = naturalWidth / renderedWidth;

        // 1. Determine bounding box of ALL paths (to minimize final image size)
        // OR just keep original size but mask out white?
        // To be safe for OCR context, let's keep original size but fill non-selected with WHITE.
        // Actually, cropping to the "UNION Rect" is better for file size, but "Masking" is critical for "Surrounding Text Removal".

        // Let's do BOTH: Crop to Union Rect, AND Mask inside that rect.

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        paths.flat().forEach(p => {
            // Map to natural coords first
            const nx = (p.x - offsetX) * scale;
            const ny = (p.y - offsetY) * scale;
            minX = Math.min(minX, nx);
            minY = Math.min(minY, ny);
            maxX = Math.max(maxX, nx);
            maxY = Math.max(maxY, ny);
        });

        // Padding
        const P = 20 * scale;
        minX = Math.max(0, minX - P);
        minY = Math.max(0, minY - P);
        maxX = Math.min(naturalWidth, maxX + P);
        maxY = Math.min(naturalHeight, maxY + P);

        const width = maxX - minX;
        const height = maxY - minY;

        if (width <= 0 || height <= 0) return;

        // Create Canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 1. Fill white (Background)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        // 2. Create Clipping Path from ALL loops
        // Complex polygons can be tricky. We'll iterate all paths.
        // We want the UNION of paths.
        // Canvas `clip()` intersects. To get Union, we can draw the shapes into transparency?
        // Strategy:
        // A. Draw white background.
        // B. Draw the Image into a separate "Source" canvas.
        // C. Draw the Shapes into a "Mask" canvas (filled black).
        // D. Composite?

        // Simpler Canvas Strategy for "Show Image Only In Shapes":
        // 1. Save context.
        // 2. Define Path (all loops).
        // 3. Clip.
        // 4. Draw Image (offset by minX, minY).
        // 5. Restore.
        // BUT `clip()` with multiple disjoint paths works as "winding rule" usually?
        // If they are disjoint, `beginPath -> rect1 -> rect2 -> clip` works as union of holes usually.

        ctx.save();
        ctx.beginPath();
        paths.forEach(path => {
            if (path.length < 3) return;
            // Map start point
            const startX = ((path[0].x - offsetX) * scale) - minX;
            const startY = ((path[0].y - offsetY) * scale) - minY;
            ctx.moveTo(startX, startY);

            for (let i = 1; i < path.length; i++) {
                const px = ((path[i].x - offsetX) * scale) - minX;
                const py = ((path[i].y - offsetY) * scale) - minY;
                ctx.lineTo(px, py);
            }
            ctx.closePath();
        });

        ctx.clip(); // Everything drawn after this only appears INSIDE the paths

        // Draw the original image shifted by -minX, -minY
        ctx.drawImage(imgElement, -minX, -minY);
        ctx.restore();

        canvas.toBlob(blob => {
            if (blob) setCroppedImage(blob);
        }, 'image/jpeg', 0.9);
    };

    const clearCrop = () => {
        setCroppedImage(null);
        setAllPaths([]);
        setCurrentPath([]);
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    };

    const handleUpload = async () => {
        if (!fileInputRef.current?.files?.[0]) return;

        setIsUploading(true);
        setIsUploading(true);
        const formData = new FormData();

        if (croppedImage) {
            // Use the cropped blob
            formData.append("file", croppedImage, "crop.jpg");
        } else {
            formData.append("file", fileInputRef.current.files[0]);
        }

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

    return (
        <div className="w-full max-w-md mx-auto p-4 pb-24">
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
                    <div className="relative aspect-[3/4] max-w-[280px] mx-auto rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                        <Image
                            src={preview}
                            alt="Preview"
                            fill
                            className="object-contain img-optimized pointer-events-none"
                            onLoad={() => {
                                if (canvasRef.current && containerRef.current) {
                                    canvasRef.current.width = containerRef.current.clientWidth;
                                    canvasRef.current.height = containerRef.current.clientHeight;
                                }
                            }}
                        />
                        <canvas
                            ref={canvasRef}
                            className="absolute inset-0 z-10"
                        />

                        {croppedImage && (
                            <div className="absolute top-4 right-4 z-20">
                                <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); clearCrop(); }}>
                                    Reset Selection
                                </Button>
                            </div>
                        )}

                        {!croppedImage && (
                            <div className="absolute bottom-16 left-0 right-0 text-center text-xs text-amber-500/80 pointer-events-none">
                                Draw to circle Kanji
                            </div>
                        )}

                        {/* Location Badge */}
                        <div className={`absolute bottom-4 left-4 right-4 p-3 rounded-xl backdrop-blur-md transition-all ${location ? 'bg-zinc-900/80 text-zinc-200' : 'bg-red-500/20 text-red-200'} pointer-events-none`}>
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
